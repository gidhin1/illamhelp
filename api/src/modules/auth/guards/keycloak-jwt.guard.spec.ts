import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthUserService } from "../auth-user.service";
import { KeycloakJwtGuard } from "./keycloak-jwt.guard";

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn()
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({ kid: "test-key" })),
  jwtVerify: jwtVerifyMock
}));

function buildExecutionContext(authorizationHeader?: string): {
  context: ExecutionContext;
  request: { headers: { authorization?: string }; user?: unknown };
} {
  const request = {
    headers: {
      authorization: authorizationHeader
    }
  };
  const handler = function testHandler(): void {
    // no-op
  };
  class TestController {}

  const context = {
    switchToHttp: () => ({
      getRequest: () => request
    }),
    getHandler: () => handler,
    getClass: () => TestController
  } as unknown as ExecutionContext;

  return { context, request };
}

describe("KeycloakJwtGuard token verification", () => {
  let guard: KeycloakJwtGuard;
  let syncUserFromTokenMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jwtVerifyMock.mockReset();

    const configService: Pick<ConfigService, "get"> = {
      get<T>(propertyPath: string, defaultValue?: T): T {
        const values: Record<string, unknown> = {
          KEYCLOAK_URL: "http://localhost:8080",
          KEYCLOAK_REALM: "illamhelp",
          KEYCLOAK_CLIENT_ID: "illamhelp-api"
        };
        return (values[propertyPath] as T) ?? (defaultValue as T);
      }
    };

    syncUserFromTokenMock = vi.fn().mockResolvedValue(undefined);
    const authUserService: Pick<AuthUserService, "syncUserFromToken"> = {
      syncUserFromToken: syncUserFromTokenMock
    };

    guard = new KeycloakJwtGuard(
      configService as ConfigService,
      new Reflector(),
      authUserService as AuthUserService
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps low-level jose errors to UnauthorizedException", async () => {
    jwtVerifyMock.mockRejectedValue(new Error("JWS Protected Header is invalid"));

    const { context } = buildExecutionContext("Bearer malformed-token");
    const activation = guard.canActivate(context);
    await expect(activation).rejects.toThrow(UnauthorizedException);
    await expect(activation).rejects.toThrow("Invalid or expired bearer token");
  });

  it("maps realm-admin role to admin user role", async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: "11111111-1111-4111-8111-111111111111",
        aud: "illamhelp-api",
        realm_access: { roles: ["realm-admin"] },
        preferred_username: "ops_admin"
      }
    });

    const { context, request } = buildExecutionContext("Bearer valid-token");
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      roles: ["admin"]
    });
    expect(syncUserFromTokenMock).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      ["admin"],
      "ops_admin"
    );
  });

  it("maps realm-management realm-admin client role to admin user role", async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: "11111111-1111-4111-8111-111111111111",
        aud: "illamhelp-api",
        resource_access: {
          "realm-management": {
            roles: ["realm-admin"]
          }
        },
        preferred_username: "ops_admin"
      }
    });

    const { context, request } = buildExecutionContext("Bearer valid-token");
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      roles: ["admin"]
    });
    expect(syncUserFromTokenMock).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      ["admin"],
      "ops_admin"
    );
  });

  it("maps realm-management manage-users client role to admin user role", async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: "11111111-1111-4111-8111-111111111111",
        aud: "illamhelp-api",
        resource_access: {
          "realm-management": {
            roles: ["manage-users"]
          }
        },
        preferred_username: "ops_admin"
      }
    });

    const { context, request } = buildExecutionContext("Bearer valid-token");
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      roles: ["admin"]
    });
  });
});
