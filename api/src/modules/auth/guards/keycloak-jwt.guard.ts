import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";

import { assertUuid } from "../../../common/utils/uuid";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { AuthUserService } from "../auth-user.service";
import {
  AppRole,
  AuthenticatedUser
} from "../interfaces/authenticated-user.interface";
import { UserType } from "../interfaces/user-type.enum";

interface KeycloakTokenPayload extends JWTPayload {
  sub?: string;
  azp?: string;
  aud?: string | string[];
  preferred_username?: string;
  email?: string;
  realm_access?: {
    roles?: string[];
  };
  resource_access?: Record<string, { roles?: string[] }>;
}

interface RequestWithUser extends FastifyRequest {
  user?: AuthenticatedUser;
}

const APP_ROLES: AppRole[] = ["both", "seeker", "provider", "admin", "support"];
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
export class KeycloakJwtGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly clientId: string;

  constructor(
    configService: ConfigService,
    private readonly reflector: Reflector,
    private readonly authUserService: AuthUserService
  ) {
    const keycloakUrl = configService.get<string>("KEYCLOAK_URL", "http://localhost:8080");
    const realm = configService.get<string>("KEYCLOAK_REALM", "illamhelp");
    this.clientId = configService.get<string>("KEYCLOAK_CLIENT_ID", "illamhelp-api");
    this.issuer = `${keycloakUrl}/realms/${realm}`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/protocol/openid-connect/certs`));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request.headers.authorization);

    try {
      const verification = await jwtVerify(token, this.jwks, {
        issuer: this.issuer
      });

      const payload = verification.payload as KeycloakTokenPayload;
      this.assertClientMatch(payload);
      this.assertTokenSubject(payload.sub);

      const roles = this.normalizeAppRoles(this.extractRoles(payload));
      const publicUserId = this.resolvePublicUserId(payload);
      const user: AuthenticatedUser = {
        userId: payload.sub as string,
        publicUserId,
        roles,
        userType: this.resolveUserType(roles),
        tokenSubject: payload.sub as string
      };

      await this.authUserService.syncUserFromToken(user.userId, roles, publicUserId);
      request.user = user;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid or expired bearer token");
    }
  }

  private extractBearerToken(headerValue?: string): string {
    if (!headerValue) {
      throw new UnauthorizedException("Missing Authorization header");
    }

    const [scheme, token] = headerValue.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Invalid Authorization header format");
    }

    return token;
  }

  private assertTokenSubject(sub?: string): void {
    if (!sub) {
      throw new UnauthorizedException("Token is missing subject");
    }

    try {
      assertUuid(sub, "token.sub");
    } catch {
      throw new UnauthorizedException("Token subject must be a UUID");
    }
  }

  private assertClientMatch(payload: KeycloakTokenPayload): void {
    const audience = payload.aud;
    const audienceMatch = Array.isArray(audience)
      ? audience.includes(this.clientId)
      : audience === this.clientId;
    const azpMatch = payload.azp === this.clientId;

    if (!audienceMatch && !azpMatch) {
      throw new UnauthorizedException("Token audience mismatch");
    }
  }

  private extractRoles(payload: KeycloakTokenPayload): AppRole[] {
    const realmRoles = payload.realm_access?.roles ?? [];
    const clientRoles = payload.resource_access?.[this.clientId]?.roles ?? [];
    const allClientRoles = Object.values(payload.resource_access ?? {}).flatMap(
      (entry) => entry.roles ?? []
    );

    const appRoleCandidates = [...new Set([...realmRoles, ...clientRoles])];
    const aliasCandidates = [...new Set([...realmRoles, ...allClientRoles])];

    const directAppRoles = APP_ROLES.filter((role) => appRoleCandidates.includes(role));
    const aliasMappedRoles = [
      ...new Set(
        aliasCandidates
          .map((roleName) => APP_ROLE_ALIASES[roleName])
          .filter((roleName): roleName is AppRole => Boolean(roleName))
      )
    ];
    const mappedRoles = [...new Set([...directAppRoles, ...aliasMappedRoles])];
    return mappedRoles.length > 0 ? mappedRoles : ["seeker"];
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

  private resolveUserType(roles: AppRole[]): UserType {
    const hasBoth = roles.includes("both");
    const hasSeeker = roles.includes("seeker");
    const hasProvider = roles.includes("provider");

    if (hasBoth || hasSeeker || hasProvider) {
      return UserType.BOTH;
    }
    return UserType.BOTH;
  }

  private resolvePublicUserId(payload: KeycloakTokenPayload): string {
    const candidates = [
      payload.preferred_username,
      payload.email?.split("@")[0]
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizePublicUserIdCandidate(candidate);
      if (normalized) {
        return normalized;
      }
    }

    const fallbackSource = (payload.sub ?? "").replace(/-/g, "").toLowerCase();
    return `member_${fallbackSource.slice(0, 10)}`;
  }

  private normalizePublicUserIdCandidate(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized.length < 3 || normalized.length > 40) {
      return null;
    }
    if (!/^[a-z0-9._-]+$/.test(normalized)) {
      return null;
    }
    return normalized;
  }
}
