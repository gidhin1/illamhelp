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

function buildExecutionContext(authorizationHeader?: string): ExecutionContext {
  const request = {
    headers: {
      authorization: authorizationHeader
    }
  };
  const handler = function testHandler(): void {
    // no-op
  };
  class TestController {}

  return {
    switchToHttp: () => ({
      getRequest: () => request
    }),
    getHandler: () => handler,
    getClass: () => TestController
  } as unknown as ExecutionContext;
}

describe("KeycloakJwtGuard token verification", () => {
  let guard: KeycloakJwtGuard;

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

    const authUserService: Pick<AuthUserService, "syncUserFromToken"> = {
      syncUserFromToken: vi.fn().mockResolvedValue(undefined)
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

    const context = buildExecutionContext("Bearer malformed-token");
    const activation = guard.canActivate(context);
    await expect(activation).rejects.toThrow(UnauthorizedException);
    await expect(activation).rejects.toThrow("Invalid or expired bearer token");
  });
});
