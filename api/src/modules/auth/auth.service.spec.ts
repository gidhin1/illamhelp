import type { ConfigService } from "@nestjs/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth.service";
import type { AuthUserService } from "./auth-user.service";

const DEFAULT_SUB = "11111111-1111-4111-8111-111111111111";

type ConfigMap = Record<string, string | undefined>;

function createConfigService(overrides: ConfigMap = {}): ConfigService {
  const values: ConfigMap = {
    KEYCLOAK_URL: "http://localhost:8080",
    KEYCLOAK_REALM: "illamhelp",
    KEYCLOAK_CLIENT_ID: "illamhelp-api",
    KEYCLOAK_ADMIN_REALM: "master",
    KEYCLOAK_ADMIN_CLIENT_ID: "admin-cli",
    KEYCLOAK_ADMIN: "admin",
    KEYCLOAK_ADMIN_PASSWORD: "admin-password",
    AUTH_STARTUP_CHECK_ENABLED: "true",
    ...overrides
  };

  return {
    get<T>(propertyPath: string, defaultValue?: T): T {
      const value = values[propertyPath];
      return (value === undefined ? defaultValue : (value as unknown as T)) as T;
    }
  } as ConfigService;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

function buildJwt(payload: object): string {
  const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.`;
}

describe("AuthService startup and client bootstrap", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let authUserServiceMock: AuthUserService;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    authUserServiceMock = {
      syncUserFromToken: vi.fn().mockResolvedValue(undefined)
    } as unknown as AuthUserService;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("fails startup fast when admin client is invalid", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        error: "invalid_client",
        error_description: "Invalid client or Invalid client credentials"
      })
    );

    const service = new AuthService(createConfigService(), authUserServiceMock);
    await expect(service.onModuleInit()).rejects.toThrow(
      "Invalid Keycloak admin client configuration"
    );
  });

  it("can skip startup check when AUTH_STARTUP_CHECK_ENABLED=false", async () => {
    const service = new AuthService(
      createConfigService({ AUTH_STARTUP_CHECK_ENABLED: "false" }),
      authUserServiceMock
    );

    await service.onModuleInit();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("repairs password-grant client on startup", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "admin-token",
          expires_in: 300,
          token_type: "Bearer"
        })
      )
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(emptyResponse(201))
      .mockResolvedValueOnce(
        jsonResponse(200, [{ id: "client-internal-id", clientId: "illamhelp-api" }])
      )
      .mockResolvedValueOnce(emptyResponse(204));

    const service = new AuthService(createConfigService(), authUserServiceMock);
    await service.onModuleInit();

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const createCall = fetchMock.mock.calls[2];
    const createUrl = createCall[0] as string;
    const createInit = createCall[1] as RequestInit;
    expect(createUrl).toContain("/admin/realms/illamhelp/clients");
    expect(createInit.method).toBe("POST");
    const createBody = JSON.parse((createInit.body as string) ?? "{}") as {
      publicClient?: boolean;
      directAccessGrantsEnabled?: boolean;
      clientId?: string;
    };
    expect(createBody.clientId).toBe("illamhelp-api");
    expect(createBody.publicClient).toBe(true);
    expect(createBody.directAccessGrantsEnabled).toBe(true);
  });

  it("self-heals client drift during login and retries token request", async () => {
    fetchMock
      // Initial ensurePasswordGrantClientForAuth()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "admin-token-1",
          expires_in: 300,
          token_type: "Bearer"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [{ id: "client-internal-id", clientId: "illamhelp-api" }])
      )
      .mockResolvedValueOnce(emptyResponse(204))
      // First token attempt -> invalid client
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: "invalid_client",
          error_description: "Invalid client or Invalid client credentials"
        })
      )
      // Self-heal ensurePasswordGrantClientForAuth() after invalid_client
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "admin-token-2",
          expires_in: 300,
          token_type: "Bearer"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [{ id: "client-internal-id", clientId: "illamhelp-api" }])
      )
      .mockResolvedValueOnce(emptyResponse(204))
      // Retry token attempt -> success
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: buildJwt({
            sub: DEFAULT_SUB,
            realm_access: { roles: ["provider"] }
          }),
          expires_in: 300,
          token_type: "Bearer"
        })
      );

    const service = new AuthService(createConfigService(), authUserServiceMock);
    const result = await service.login({
      username: "test-user",
      password: "Passw0rd!"
    });

    expect(result.userType).toBe("both");
    expect(result.userId).toBe(DEFAULT_SUB);
    expect(result.publicUserId).toBe("test-user");
    expect(authUserServiceMock.syncUserFromToken).toHaveBeenCalledWith(DEFAULT_SUB, [
      "both"
    ], "test-user");

    const firstTokenAttempt = fetchMock.mock.calls[3];
    const secondTokenAttempt = fetchMock.mock.calls[7];
    const firstTokenBody = (firstTokenAttempt[1] as RequestInit).body as string;
    const secondTokenBody = (secondTokenAttempt[1] as RequestInit).body as string;

    expect(firstTokenBody).toContain("client_id=illamhelp-api");
    expect(firstTokenBody).not.toContain("client_secret=");
    expect(secondTokenBody).toContain("client_id=illamhelp-api");
    expect(secondTokenBody).not.toContain("client_secret=");
  });

  it("maps realm-admin token role to admin access", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "admin-token-1",
          expires_in: 300,
          token_type: "Bearer"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [{ id: "client-internal-id", clientId: "illamhelp-api" }])
      )
      .mockResolvedValueOnce(emptyResponse(204))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: buildJwt({
            sub: DEFAULT_SUB,
            realm_access: { roles: ["realm-admin"] }
          }),
          expires_in: 300,
          token_type: "Bearer"
        })
      );

    const service = new AuthService(createConfigService(), authUserServiceMock);
    const result = await service.login({
      username: "admin",
      password: "Passw0rd!"
    });

    expect(result.roles).toEqual(["admin"]);
    expect(authUserServiceMock.syncUserFromToken).toHaveBeenCalledWith(
      DEFAULT_SUB,
      ["admin"],
      "admin"
    );
  });

  it("maps realm-management realm-admin client role to admin access", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "admin-token-1",
          expires_in: 300,
          token_type: "Bearer"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [{ id: "client-internal-id", clientId: "illamhelp-api" }])
      )
      .mockResolvedValueOnce(emptyResponse(204))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: buildJwt({
            sub: DEFAULT_SUB,
            resource_access: {
              "realm-management": {
                roles: ["realm-admin"]
              }
            }
          }),
          expires_in: 300,
          token_type: "Bearer"
        })
      );

    const service = new AuthService(createConfigService(), authUserServiceMock);
    const result = await service.login({
      username: "admin",
      password: "Passw0rd!"
    });

    expect(result.roles).toEqual(["admin"]);
    expect(authUserServiceMock.syncUserFromToken).toHaveBeenCalledWith(
      DEFAULT_SUB,
      ["admin"],
      "admin"
    );
  });

  it("maps realm-management manage-users client role to admin access", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "admin-token-1",
          expires_in: 300,
          token_type: "Bearer"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [{ id: "client-internal-id", clientId: "illamhelp-api" }])
      )
      .mockResolvedValueOnce(emptyResponse(204))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: buildJwt({
            sub: DEFAULT_SUB,
            resource_access: {
              "realm-management": {
                roles: ["manage-users"]
              }
            }
          }),
          expires_in: 300,
          token_type: "Bearer"
        })
      );

    const service = new AuthService(createConfigService(), authUserServiceMock);
    const result = await service.login({
      username: "admin",
      password: "Passw0rd!"
    });

    expect(result.roles).toEqual(["admin"]);
  });

  it("returns explicit client-config error when invalid_client persists", async () => {
    fetchMock
      // Initial ensurePasswordGrantClientForAuth()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "admin-token-1",
          expires_in: 300,
          token_type: "Bearer"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [{ id: "client-internal-id", clientId: "illamhelp-api" }])
      )
      .mockResolvedValueOnce(emptyResponse(204))
      // First token attempt
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: "invalid_client",
          error_description: "Invalid client or Invalid client credentials"
        })
      )
      // Self-heal ensurePasswordGrantClientForAuth()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "admin-token-2",
          expires_in: 300,
          token_type: "Bearer"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [{ id: "client-internal-id", clientId: "illamhelp-api" }])
      )
      .mockResolvedValueOnce(emptyResponse(204))
      // Retry still invalid_client
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: "invalid_client",
          error_description: "Invalid client or Invalid client credentials"
        })
      );

    const service = new AuthService(createConfigService(), authUserServiceMock);
    await expect(
      service.login({
        username: "test-user",
        password: "Passw0rd!"
      })
    ).rejects.toThrow("Invalid Keycloak client configuration");
  });
});

describe("AuthService token refresh and logout", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let authUserServiceMock: AuthUserService;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    authUserServiceMock = {
      syncUserFromToken: vi.fn().mockResolvedValue(undefined),
      getUsernameByUserId: vi.fn().mockResolvedValue("test-user")
    } as unknown as AuthUserService;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("refreshAccessToken returns new session from valid refresh token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: buildJwt({
          sub: DEFAULT_SUB,
          realm_access: { roles: ["both"] }
        }),
        refresh_token: "new-refresh-token",
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: "Bearer",
        scope: "openid"
      })
    );

    const service = new AuthService(
      createConfigService({ AUTH_STARTUP_CHECK_ENABLED: "false" }),
      authUserServiceMock
    );
    const result = await service.refreshAccessToken("old-refresh-token");

    expect(result.userId).toBe(DEFAULT_SUB);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBe("new-refresh-token");
    expect(result.expiresIn).toBe(300);
    expect(result.tokenType).toBe("Bearer");
    expect(authUserServiceMock.getUsernameByUserId).toHaveBeenCalledWith(DEFAULT_SUB);
    expect(authUserServiceMock.syncUserFromToken).toHaveBeenCalledWith(
      DEFAULT_SUB,
      ["both"],
      "test-user"
    );

    const fetchCall = fetchMock.mock.calls[0];
    const body = fetchCall[1].body as string;
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=old-refresh-token");
  });

  it("refreshAccessToken throws UnauthorizedException for expired refresh token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: "invalid_grant",
        error_description: "Token is not active"
      })
    );

    const service = new AuthService(
      createConfigService({ AUTH_STARTUP_CHECK_ENABLED: "false" }),
      authUserServiceMock
    );
    await expect(service.refreshAccessToken("expired-token")).rejects.toThrow(
      "Token is not active"
    );
  });

  it("logout calls Keycloak logout endpoint", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));

    const service = new AuthService(
      createConfigService({ AUTH_STARTUP_CHECK_ENABLED: "false" }),
      authUserServiceMock
    );
    await service.logout("refresh-token-to-revoke");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/protocol/openid-connect/logout");
    expect((init.body as string)).toContain("refresh_token=refresh-token-to-revoke");
  });

  it("logout tolerates Keycloak errors gracefully", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(500));

    const service = new AuthService(
      createConfigService({ AUTH_STARTUP_CHECK_ENABLED: "false" }),
      authUserServiceMock
    );
    // Should not throw
    await service.logout("some-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
