import { randomUUID } from "node:crypto";

import {
  BadGatewayException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AuthUserService } from "./auth-user.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { AppRole } from "./interfaces/authenticated-user.interface";
import { UserType } from "./interfaces/user-type.enum";

interface KeycloakRoleRepresentation {
  id: string;
  name: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
}

interface KeycloakClientRepresentation {
  id: string;
  clientId: string;
}

interface KeycloakTokenPayload {
  sub?: string;
  realm_access?: {
    roles?: string[];
  };
  resource_access?: Record<string, { roles?: string[] }>;
}

interface KeycloakTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  refresh_token?: string;
  token_type: string;
  scope?: string;
}

export interface AuthSessionResponse {
  userId: string;
  publicUserId: string;
  username: string;
  userType: UserType;
  roles: AppRole[];
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  refreshExpiresIn?: number;
  tokenType: string;
  scope?: string;
}

const APP_ROLE_ALIASES: Readonly<Record<string, AppRole>> = {
  "realm-admin": "admin",
  "manage-realm": "admin",
  "view-realm": "admin",
  "manage-users": "admin",
  "view-users": "admin",
  "query-users": "admin",
  "manage-clients": "admin",
  "view-clients": "admin",
  "query-clients": "admin"
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly keycloakUrl: string;
  private readonly keycloakRealm: string;
  private readonly keycloakClientId: string;
  private readonly keycloakAdminRealm: string;
  private readonly keycloakAdminClientId: string;
  private readonly keycloakAdminUsername?: string;
  private readonly keycloakAdminPassword?: string;
  private readonly keycloakHttpTimeoutMs: number;
  private readonly authStartupCheckEnabled: boolean;
  private passwordGrantClientEnsured = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly authUserService: AuthUserService
  ) {
    this.keycloakUrl = this.configService.get<string>("KEYCLOAK_URL", "http://localhost:8080");
    this.keycloakRealm = this.configService.get<string>("KEYCLOAK_REALM", "illamhelp");
    this.keycloakClientId = this.configService.get<string>(
      "KEYCLOAK_CLIENT_ID",
      "illamhelp-api"
    );

    this.keycloakAdminRealm = this.configService.get<string>(
      "KEYCLOAK_ADMIN_REALM",
      "master"
    );
    this.keycloakAdminClientId = this.configService.get<string>(
      "KEYCLOAK_ADMIN_CLIENT_ID",
      "admin-cli"
    );
    this.keycloakAdminUsername = this.configService.get<string>("KEYCLOAK_ADMIN");
    this.keycloakAdminPassword = this.configService.get<string>("KEYCLOAK_ADMIN_PASSWORD");
    this.keycloakHttpTimeoutMs = this.parsePositiveInt(
      this.configService.get<string>("KEYCLOAK_HTTP_TIMEOUT_MS", "8000"),
      8000
    );

    this.authStartupCheckEnabled =
      this.configService.get<string>("AUTH_STARTUP_CHECK_ENABLED", "true") !== "false";
  }

  async onModuleInit(): Promise<void> {
    if (!this.authStartupCheckEnabled) {
      return;
    }
    await this.ensurePasswordGrantClientForAuth();
  }

  async register(input: RegisterDto): Promise<AuthSessionResponse> {
    const username = this.resolveUsername(input.username);
    const provisionalUserId = randomUUID();
    const adminAccessToken = await this.getAdminAccessToken();
    const rolesToAssign: AppRole[] = ["both"];

    const keycloakUserId = await this.createUser(adminAccessToken, {
      id: provisionalUserId,
      username,
      email: input.email.toLowerCase(),
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim(),
      password: input.password
    });

    for (const roleName of rolesToAssign) {
      await this.ensureRealmRole(adminAccessToken, roleName);
    }

    const roleRepresentations = await Promise.all(
      rolesToAssign.map((roleName) => this.getRealmRole(adminAccessToken, roleName))
    );
    await this.assignRealmRoles(adminAccessToken, keycloakUserId, roleRepresentations);
    await this.ensurePasswordGrantClient(adminAccessToken);

    const tokenResponse = await this.getUserAccessToken({
      username,
      password: input.password
    });
    const decodedPayload = this.decodeJwtPayload(tokenResponse.access_token);
    const userRoles = this.normalizeAppRoles(this.extractRoles(decodedPayload));
    const tokenUserId = this.extractUserId(decodedPayload, keycloakUserId);

    await this.authUserService.syncUserFromToken(tokenUserId, userRoles, username);

    return {
      userId: tokenUserId,
      publicUserId: username,
      username,
      userType: UserType.BOTH,
      roles: userRoles,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
      refreshExpiresIn: tokenResponse.refresh_expires_in,
      tokenType: tokenResponse.token_type,
      scope: tokenResponse.scope
    };
  }

  async login(input: LoginDto): Promise<AuthSessionResponse> {
    const username = input.username.trim().toLowerCase();
    await this.ensurePasswordGrantClientForAuth();
    const tokenResponse = await this.getUserAccessToken({
      username,
      password: input.password
    });

    const decodedPayload = this.decodeJwtPayload(tokenResponse.access_token);
    const userRoles = this.normalizeAppRoles(this.extractRoles(decodedPayload));
    const userId = this.extractUserId(decodedPayload);

    await this.authUserService.syncUserFromToken(userId, userRoles, username);

    return {
      userId,
      publicUserId: username,
      username,
      userType: this.userTypeFromRoles(userRoles),
      roles: userRoles,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
      refreshExpiresIn: tokenResponse.refresh_expires_in,
      tokenType: tokenResponse.token_type,
      scope: tokenResponse.scope
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthSessionResponse> {
    const formData = new URLSearchParams();
    formData.set("grant_type", "refresh_token");
    formData.set("client_id", this.keycloakClientId);
    formData.set("refresh_token", refreshToken);

    const response = await this.keycloakFetch(
      `${this.keycloakUrl}/realms/${this.keycloakRealm}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData.toString()
      },
      "token refresh"
    );

    const responseBody = (await response.json().catch(() => ({}))) as Partial<
      KeycloakTokenResponse
    > & {
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !responseBody.access_token || !responseBody.token_type) {
      throw new UnauthorizedException(
        responseBody.error_description ?? "Unable to refresh token. Please sign in again."
      );
    }

    const tokenResponse = responseBody as KeycloakTokenResponse;
    const decodedPayload = this.decodeJwtPayload(tokenResponse.access_token);
    const userRoles = this.normalizeAppRoles(this.extractRoles(decodedPayload));
    const userId = this.extractUserId(decodedPayload);

    const username = await this.authUserService.getUsernameByUserId(userId);
    await this.authUserService.syncUserFromToken(userId, userRoles, username ?? userId);

    return {
      userId,
      publicUserId: username ?? userId,
      username: username ?? userId,
      userType: this.userTypeFromRoles(userRoles),
      roles: userRoles,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
      refreshExpiresIn: tokenResponse.refresh_expires_in,
      tokenType: tokenResponse.token_type,
      scope: tokenResponse.scope
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const formData = new URLSearchParams();
    formData.set("client_id", this.keycloakClientId);
    formData.set("refresh_token", refreshToken);

    const response = await this.keycloakFetch(
      `${this.keycloakUrl}/realms/${this.keycloakRealm}/protocol/openid-connect/logout`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData.toString()
      },
      "session logout"
    );

    // Keycloak returns 204 on success; tolerate errors gracefully
    // since we still want the client to clear local state
    if (!response.ok && response.status !== 204) {
      console.warn(`[AuthService] Keycloak logout returned ${response.status}`);
    }
  }

  private resolveUsername(username: string): string {
    return username.trim().toLowerCase();
  }

  private userTypeFromRoles(roles: AppRole[]): UserType {
    const hasBoth = roles.includes("both");
    const hasSeeker = roles.includes("seeker");
    const hasProvider = roles.includes("provider");

    if (hasBoth || hasSeeker || hasProvider) {
      return UserType.BOTH;
    }
    return UserType.BOTH;
  }

  private async getAdminAccessToken(): Promise<string> {
    if (!this.keycloakAdminUsername || !this.keycloakAdminPassword) {
      throw new InternalServerErrorException(
        "Keycloak admin credentials are not configured"
      );
    }

    const formData = new URLSearchParams();
    formData.set("grant_type", "password");
    formData.set("client_id", this.keycloakAdminClientId);
    formData.set("username", this.keycloakAdminUsername);
    formData.set("password", this.keycloakAdminPassword);

    const response = await this.keycloakFetch(
      `${this.keycloakUrl}/realms/${this.keycloakAdminRealm}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData.toString()
      },
      "admin token request"
    );

    const responseBody = (await response.json().catch(() => ({}))) as Partial<
      KeycloakTokenResponse
    > & {
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !responseBody.access_token) {
      if (this.isInvalidClientError(response, responseBody)) {
        throw new UnauthorizedException(
          "Invalid Keycloak admin client configuration (master/admin-cli). Run 'make keycloak-bootstrap'."
        );
      }

      throw new UnauthorizedException(
        responseBody.error_description ?? "Unable to get Keycloak admin access token"
      );
    }

    return responseBody.access_token;
  }

  private async createUser(
    adminAccessToken: string,
    user: {
      id: string;
      username: string;
      email: string;
      firstName: string;
      lastName?: string;
      password: string;
    }
  ): Promise<string> {
    const response = await this.keycloakFetch(
      `${this.keycloakUrl}/admin/realms/${this.keycloakRealm}/users`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          enabled: true,
          emailVerified: false,
          credentials: [
            {
              type: "password",
              value: user.password,
              temporary: false
            }
          ]
        })
      },
      "user creation"
    );

    if (response.status === 409) {
      throw new ConflictException("Unable to create account with provided credentials");
    }
    if (response.ok) {
      const locationHeader = response.headers.get("location");
      const userIdFromLocation = this.userIdFromLocationHeader(locationHeader);
      if (userIdFromLocation) {
        return userIdFromLocation;
      }
      return this.getUserIdByUsername(adminAccessToken, user.username);
    }

    throw new BadGatewayException("Failed to create user in Keycloak");
  }

  private async ensureRealmRole(adminAccessToken: string, roleName: AppRole): Promise<void> {
    const existingRoleResponse = await this.keycloakFetch(
      `${this.keycloakUrl}/admin/realms/${this.keycloakRealm}/roles/${roleName}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${adminAccessToken}`
        }
      },
      "role lookup"
    );

    if (existingRoleResponse.ok) {
      return;
    }

    if (existingRoleResponse.status !== 404) {
      throw new BadGatewayException(
        `Failed to verify realm role '${roleName}' in Keycloak`
      );
    }

    const createRoleResponse = await this.keycloakFetch(
      `${this.keycloakUrl}/admin/realms/${this.keycloakRealm}/roles`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: roleName
        })
      },
      "role creation"
    );

    if (!(createRoleResponse.ok || createRoleResponse.status === 409)) {
      throw new BadGatewayException(`Failed to create realm role '${roleName}'`);
    }
  }

  private async getRealmRole(
    adminAccessToken: string,
    roleName: AppRole
  ): Promise<KeycloakRoleRepresentation> {
    const response = await this.keycloakFetch(
      `${this.keycloakUrl}/admin/realms/${this.keycloakRealm}/roles/${roleName}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${adminAccessToken}`
        }
      },
      "role fetch"
    );

    if (!response.ok) {
      throw new BadGatewayException(`Failed to fetch realm role '${roleName}'`);
    }

    const role = (await response.json()) as KeycloakRoleRepresentation;
    return role;
  }

  private async assignRealmRoles(
    adminAccessToken: string,
    userId: string,
    roleRepresentations: KeycloakRoleRepresentation[]
  ): Promise<void> {
    const response = await this.keycloakFetch(
      `${this.keycloakUrl}/admin/realms/${this.keycloakRealm}/users/${userId}/role-mappings/realm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(roleRepresentations)
      },
      "role assignment"
    );

    if (!response.ok) {
      throw new BadGatewayException("Failed to assign realm roles");
    }
  }

  private async getUserAccessToken(input: {
    username: string;
    password: string;
  }): Promise<KeycloakTokenResponse> {
    const attempt = await this.requestUserAccessToken(input);
    if (attempt.response.ok && attempt.responseBody.access_token && attempt.responseBody.token_type) {
      return attempt.responseBody as KeycloakTokenResponse;
    }

    if (this.isInvalidClientError(attempt.response, attempt.responseBody)) {
      this.passwordGrantClientEnsured = false;
      await this.ensurePasswordGrantClientForAuth();

      const retry = await this.requestUserAccessToken(input);
      if (retry.response.ok && retry.responseBody.access_token && retry.responseBody.token_type) {
        return retry.responseBody as KeycloakTokenResponse;
      }

      if (this.isInvalidClientError(retry.response, retry.responseBody)) {
        throw new UnauthorizedException(
          "Invalid Keycloak client configuration. Run 'make keycloak-bootstrap' and verify KEYCLOAK_CLIENT_ID/KEYCLOAK_CLIENT_SECRET."
        );
      }

      if (retry.response.status === 400 || retry.response.status === 401 || retry.response.status === 403) {
        throw new UnauthorizedException("Invalid username or password");
      }

      throw new BadGatewayException("Failed to login via Keycloak");
    }

    if (attempt.response.status === 400 || attempt.response.status === 401 || attempt.response.status === 403) {
      throw new UnauthorizedException("Invalid username or password");
    }

    throw new BadGatewayException("Failed to login via Keycloak");
  }

  private async requestUserAccessToken(
    input: {
      username: string;
      password: string;
    }
  ): Promise<{
    response: Response;
    responseBody: Partial<KeycloakTokenResponse> & {
      error?: string;
      error_description?: string;
    };
  }> {
    const formData = new URLSearchParams();
    formData.set("grant_type", "password");
    formData.set("client_id", this.keycloakClientId);
    formData.set("username", input.username);
    formData.set("password", input.password);

    const response = await this.keycloakFetch(
      `${this.keycloakUrl}/realms/${this.keycloakRealm}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData.toString()
      },
      "user token request"
    );

    const responseBody = (await response.json().catch(() => ({}))) as Partial<
      KeycloakTokenResponse
    > & {
      error?: string;
      error_description?: string;
    };

    return { response, responseBody };
  }

  private async ensurePasswordGrantClientForAuth(): Promise<void> {
    if (this.passwordGrantClientEnsured) {
      return;
    }

    const adminAccessToken = await this.getAdminAccessToken();
    await this.ensurePasswordGrantClient(adminAccessToken);
  }

  private async ensurePasswordGrantClient(adminAccessToken: string): Promise<void> {
    if (this.passwordGrantClientEnsured) {
      return;
    }

    let internalClientId = await this.getClientInternalId(adminAccessToken);
    if (!internalClientId) {
      internalClientId = await this.createPasswordGrantClient(adminAccessToken);
    }

    await this.updatePasswordGrantClient(adminAccessToken, internalClientId);
    this.passwordGrantClientEnsured = true;
  }

  private async getClientInternalId(adminAccessToken: string): Promise<string | undefined> {
    const response = await this.keycloakFetch(
      `${this.keycloakUrl}/admin/realms/${this.keycloakRealm}/clients?clientId=${encodeURIComponent(this.keycloakClientId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${adminAccessToken}`
        }
      },
      "client lookup"
    );

    if (!response.ok) {
      throw new BadGatewayException("Failed to lookup Keycloak client");
    }

    const clients = (await response.json()) as KeycloakClientRepresentation[];
    return clients.find((client) => client.clientId === this.keycloakClientId)?.id;
  }

  private async createPasswordGrantClient(adminAccessToken: string): Promise<string> {
    const response = await this.keycloakFetch(
      `${this.keycloakUrl}/admin/realms/${this.keycloakRealm}/clients`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clientId: this.keycloakClientId,
          protocol: "openid-connect",
          enabled: true,
          publicClient: true,
          directAccessGrantsEnabled: true,
          standardFlowEnabled: true,
          serviceAccountsEnabled: false
        })
      },
      "client creation"
    );

    if (!(response.ok || response.status === 409)) {
      throw new BadGatewayException("Failed to create Keycloak client");
    }

    const internalClientId = await this.getClientInternalId(adminAccessToken);
    if (!internalClientId) {
      throw new BadGatewayException("Created Keycloak client not found");
    }
    return internalClientId;
  }

  private async updatePasswordGrantClient(
    adminAccessToken: string,
    internalClientId: string
  ): Promise<void> {
    const response = await this.keycloakFetch(
      `${this.keycloakUrl}/admin/realms/${this.keycloakRealm}/clients/${internalClientId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: internalClientId,
          clientId: this.keycloakClientId,
          protocol: "openid-connect",
          enabled: true,
          publicClient: true,
          directAccessGrantsEnabled: true,
          standardFlowEnabled: true,
          serviceAccountsEnabled: false
        })
      },
      "client update"
    );

    if (!response.ok) {
      throw new BadGatewayException("Failed to update Keycloak client");
    }
  }

  private isInvalidClientError(
    response: Response,
    responseBody: { error?: string; error_description?: string }
  ): boolean {
    if (!(response.status === 400 || response.status === 401 || response.status === 403)) {
      return false;
    }

    const errorText =
      `${responseBody.error ?? ""} ${responseBody.error_description ?? ""}`.toLowerCase();
    return (
      errorText.includes("invalid client") ||
      errorText.includes("invalid_client") ||
      errorText.includes("client credentials")
    );
  }

  private userIdFromLocationHeader(locationHeader: string | null): string | undefined {
    if (!locationHeader) {
      return undefined;
    }
    const segments = locationHeader.split("/").filter(Boolean);
    const userId = segments[segments.length - 1];
    return userId && userId.length > 0 ? userId : undefined;
  }

  private async getUserIdByUsername(
    adminAccessToken: string,
    username: string
  ): Promise<string> {
    const response = await this.keycloakFetch(
      `${this.keycloakUrl}/admin/realms/${this.keycloakRealm}/users?username=${encodeURIComponent(username)}&exact=true`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${adminAccessToken}`
        }
      },
      "user lookup"
    );

    if (!response.ok) {
      throw new BadGatewayException("Failed to resolve created user in Keycloak");
    }

    const users = (await response.json()) as Array<{ id?: string }>;
    const userId = users.find((entry) => !!entry.id)?.id;
    if (!userId) {
      throw new BadGatewayException("Created user not found in Keycloak");
    }
    return userId;
  }

  private decodeJwtPayload(accessToken: string): KeycloakTokenPayload {
    const tokenParts = accessToken.split(".");
    if (tokenParts.length < 2) {
      throw new UnauthorizedException("Invalid access token format");
    }

    try {
      const payload = Buffer.from(tokenParts[1], "base64url").toString("utf8");
      return JSON.parse(payload) as KeycloakTokenPayload;
    } catch {
      throw new UnauthorizedException("Invalid access token payload");
    }
  }

  private extractUserId(payload: KeycloakTokenPayload, fallbackUserId?: string): string {
    if (payload.sub && payload.sub.length > 0) {
      return payload.sub;
    }
    if (fallbackUserId) {
      return fallbackUserId;
    }
    throw new UnauthorizedException("Access token missing subject");
  }

  private extractRoles(payload: KeycloakTokenPayload): AppRole[] {
    const realmRoles = payload.realm_access?.roles ?? [];
    const clientRoles = payload.resource_access?.[this.keycloakClientId]?.roles ?? [];
    const allClientRoles = Object.values(payload.resource_access ?? {}).flatMap(
      (entry) => entry.roles ?? []
    );
    const appRoleCandidates = [...new Set([...realmRoles, ...clientRoles])];
    const aliasCandidates = [...new Set([...realmRoles, ...allClientRoles])];
    const appRoles: AppRole[] = ["both", "seeker", "provider", "admin", "support"];
    const directAppRoles: AppRole[] = appRoles.filter((role) => appRoleCandidates.includes(role));
    const aliasMappedRoles = [
      ...new Set(
        aliasCandidates
          .map((roleName) => APP_ROLE_ALIASES[roleName])
          .filter((roleName): roleName is AppRole => Boolean(roleName))
      )
    ];
    const roles = [...new Set([...directAppRoles, ...aliasMappedRoles])];
    return roles.length > 0 ? roles : ["seeker"];
  }

  private normalizeAppRoles(roles: AppRole[]): AppRole[] {
    const uniqueRoles = [...new Set(roles)];
    const privilegedRoles = uniqueRoles.filter(
      (role): role is AppRole => role === "admin" || role === "support"
    );

    if (privilegedRoles.length > 0) {
      return privilegedRoles;
    }

    return ["both"];
  }

  private async keycloakFetch(
    url: string,
    init: RequestInit,
    operation: string
  ): Promise<Response> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), this.keycloakHttpTimeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: abortController.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ServiceUnavailableException(
          `Keycloak request timed out for ${operation} after ${this.keycloakHttpTimeoutMs}ms at ${this.keycloakUrl}.`
        );
      }
      throw new ServiceUnavailableException(
        `Unable to reach Keycloak for ${operation} at ${this.keycloakUrl}. Start it with 'make up-auth' or 'make up-core'.`
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private parsePositiveInt(value: string | number, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.trunc(parsed);
  }
}
