import { randomUUID } from "node:crypto";

import type { ExecutionContext } from "@nestjs/common";
import {
  UnauthorizedException,
  BadRequestException
} from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { QueryResult, QueryResultRow } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../common/database/database.service";
import type { OpaService } from "../../common/policy/opa.service";
import { AuditService } from "../audit/audit.service";
import { AuthUserService } from "../auth/auth-user.service";
import type { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { KeycloakJwtGuard } from "../auth/guards/keycloak-jwt.guard";
import { ConsentField } from "./dto/consent-field.enum";
import { ConsentService } from "./consent.service";

const SEEKER_USER_ID = "11111111-1111-4111-8111-111111111111";
const PROVIDER_USER_ID = "22222222-2222-4222-8222-222222222222";
const CONNECTION_ID = "33333333-3333-4333-8333-333333333333";
const ACCESS_REQUEST_ID = "44444444-4444-4444-8444-444444444444";

const SEEKER_TOKEN = "seeker-token";
const PROVIDER_TOKEN = "provider-token";

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn()
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({ kid: "test-key" })),
  jwtVerify: jwtVerifyMock
}));

interface ConnectionRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  requested_by_user_id: string;
  status: "pending" | "accepted" | "declined" | "blocked";
  requested_at: Date;
  decided_at: Date | null;
}

interface AccessRequestRow {
  id: string;
  requester_user_id: string;
  owner_user_id: string;
  connection_id: string;
  requested_fields: ConsentField[];
  purpose: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: Date;
  resolved_at: Date | null;
}

interface GrantRow {
  id: string;
  access_request_id: string | null;
  owner_user_id: string;
  grantee_user_id: string;
  connection_id: string;
  granted_fields: ConsentField[];
  purpose: string;
  status: "active" | "revoked";
  granted_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  revoke_reason: string | null;
}

class InMemoryDatabaseService {
  private readonly users = new Map<string, { id: string; role: string }>();
  private readonly connections = new Map<string, ConnectionRow>();
  private readonly accessRequests = new Map<string, AccessRequestRow>();
  private readonly grants = new Map<string, GrantRow>();

  constructor() {
    const requestedAt = new Date("2026-02-21T08:00:00.000Z");
    const decidedAt = new Date("2026-02-21T08:05:00.000Z");

    this.connections.set(CONNECTION_ID, {
      id: CONNECTION_ID,
      user_a_id: SEEKER_USER_ID,
      user_b_id: PROVIDER_USER_ID,
      requested_by_user_id: SEEKER_USER_ID,
      status: "accepted",
      requested_at: requestedAt,
      decided_at: decidedAt
    });

    this.accessRequests.set(ACCESS_REQUEST_ID, {
      id: ACCESS_REQUEST_ID,
      requester_user_id: SEEKER_USER_ID,
      owner_user_id: PROVIDER_USER_ID,
      connection_id: CONNECTION_ID,
      requested_fields: [ConsentField.PHONE, ConsentField.EMAIL],
      purpose: "booking coordination",
      status: "pending",
      created_at: new Date("2026-02-21T08:10:00.000Z"),
      resolved_at: null
    });
  }

  hasUser(userId: string): boolean {
    return this.users.has(userId);
  }

  async query<T extends QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const normalized = this.normalizeSql(sql);

    if (normalized.startsWith("insert into users")) {
      const userId = params[0] as string;
      const role = params[1] as string;
      this.users.set(userId, { id: userId, role });
      return this.result<T>([], 1);
    }

    if (
      normalized.includes("from pii_access_requests") &&
      normalized.includes("where id = $1::uuid")
    ) {
      const requestId = params[0] as string;
      const row = this.accessRequests.get(requestId);
      return row
        ? this.result<T>([row as unknown as T], 1)
        : this.result<T>([], 0);
    }

    if (normalized.startsWith("update pii_access_requests")) {
      const requestId = params[0] as string;
      const row = this.accessRequests.get(requestId);
      if (!row) {
        return this.result<T>([], 0);
      }

      row.status = "approved";
      row.resolved_at = new Date();
      this.accessRequests.set(requestId, row);
      return this.result<T>([], 1);
    }

    if (normalized.startsWith("insert into pii_consent_grants")) {
      const [accessRequestId, ownerId, granteeId, connectionId, fields, purpose, expiresAt] =
        params as [
          string | null,
          string,
          string,
          string,
          ConsentField[],
          string,
          string | null
        ];

      const row: GrantRow = {
        id: randomUUID(),
        access_request_id: accessRequestId,
        owner_user_id: ownerId,
        grantee_user_id: granteeId,
        connection_id: connectionId,
        granted_fields: fields,
        purpose,
        status: "active",
        granted_at: new Date(),
        expires_at: expiresAt ? new Date(expiresAt) : null,
        revoked_at: null,
        revoke_reason: null
      };

      this.grants.set(row.id, row);
      return this.result<T>([row as unknown as T], 1);
    }

    if (
      normalized.includes("from pii_consent_grants") &&
      normalized.includes("where id = $1::uuid")
    ) {
      const grantId = params[0] as string;
      const row = this.grants.get(grantId);
      return row
        ? this.result<T>([row as unknown as T], 1)
        : this.result<T>([], 0);
    }

    if (normalized.startsWith("update pii_consent_grants")) {
      const grantId = params[0] as string;
      const revokeReason = params[1] as string;
      const existing = this.grants.get(grantId);
      if (!existing) {
        return this.result<T>([], 0);
      }

      const row: GrantRow = {
        ...existing,
        status: "revoked",
        revoked_at: new Date(),
        revoke_reason: revokeReason
      };
      this.grants.set(grantId, row);
      return this.result<T>([row as unknown as T], 1);
    }

    if (
      normalized.includes("from pii_consent_grants g") &&
      normalized.includes("inner join connections c on c.id = g.connection_id")
    ) {
      const ownerId = params[0] as string;
      const granteeId = params[1] as string;
      const field = params[2] as ConsentField;

      const active = [...this.grants.values()]
        .filter(
          (grant) =>
            grant.owner_user_id === ownerId &&
            grant.grantee_user_id === granteeId &&
            grant.status === "active" &&
            grant.granted_fields.includes(field)
        )
        .sort((a, b) => b.granted_at.getTime() - a.granted_at.getTime())[0];

      if (!active) {
        return this.result<T>([], 0);
      }

      const connection = this.connections.get(active.connection_id);
      if (!connection) {
        return this.result<T>([], 0);
      }

      const row = {
        relationship_status: connection.status,
        grant_status: active.status,
        granted_fields: active.granted_fields,
        expires_at: active.expires_at
      };
      return this.result<T>([row as unknown as T], 1);
    }

    if (normalized.startsWith("insert into audit_events")) {
      return this.result<T>([], 1);
    }

    throw new Error(`Unhandled SQL in integration test DB: ${normalized}`);
  }

  private normalizeSql(sql: string): string {
    return sql.replace(/\s+/g, " ").trim().toLowerCase();
  }

  private result<T extends QueryResultRow>(rows: T[], rowCount: number): QueryResult<T> {
    return {
      command: "SELECT",
      rowCount,
      oid: 0,
      fields: [],
      rows
    } as QueryResult<T>;
  }
}

function buildExecutionContext(
  request: { headers: Record<string, string | undefined>; user?: AuthenticatedUser }
): ExecutionContext {
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

describe("Auth + Consent integration", () => {
  let db: InMemoryDatabaseService;
  let guard: KeycloakJwtGuard;
  let consentService: ConsentService;

  beforeEach(() => {
    jwtVerifyMock.mockReset();
    jwtVerifyMock.mockImplementation(async (token: string) => {
      if (token === SEEKER_TOKEN) {
        return {
          payload: {
            sub: SEEKER_USER_ID,
            aud: "illamhelp-api",
            azp: "illamhelp-api",
            realm_access: { roles: ["seeker"] }
          }
        };
      }

      if (token === PROVIDER_TOKEN) {
        return {
          payload: {
            sub: PROVIDER_USER_ID,
            aud: "illamhelp-api",
            azp: "illamhelp-api",
            realm_access: { roles: ["provider"] }
          }
        };
      }

      throw new UnauthorizedException("Invalid token");
    });

    db = new InMemoryDatabaseService();
    const databaseService = db as unknown as DatabaseService;
    const auditService = new AuditService(databaseService);
    const opaService: Pick<OpaService, "canViewPii"> = {
      canViewPii: vi.fn(async () => true)
    };

    consentService = new ConsentService(
      databaseService,
      opaService as OpaService,
      auditService
    );

    const authUserService = new AuthUserService(databaseService);
    const configService: Pick<ConfigService, "get"> = {
      get<T>(propertyPath: string, defaultValue?: T): T {
        const config: Record<string, unknown> = {
          KEYCLOAK_URL: "http://localhost:8080",
          KEYCLOAK_REALM: "illamhelp",
          KEYCLOAK_CLIENT_ID: "illamhelp-api"
        };
        return (config[propertyPath] as T) ?? (defaultValue as T);
      }
    };

    guard = new KeycloakJwtGuard(
      configService as ConfigService,
      new Reflector(),
      authUserService
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requires JWT for protected access", async () => {
    const request = { headers: {} };
    const context = buildExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it("enforces owner-only grant and revoke", async () => {
    const seeker = await authenticate(guard, SEEKER_TOKEN);
    const provider = await authenticate(guard, PROVIDER_TOKEN);

    expect(db.hasUser(seeker.userId)).toBe(true);
    expect(db.hasUser(provider.userId)).toBe(true);

    await expect(
      consentService.grant(ACCESS_REQUEST_ID, {
        ownerUserId: seeker.userId,
        grantedFields: [ConsentField.PHONE],
        purpose: "booking coordination"
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    const grant = await consentService.grant(ACCESS_REQUEST_ID, {
      ownerUserId: provider.userId,
      grantedFields: [ConsentField.PHONE],
      purpose: "booking coordination"
    });
    expect(grant.status).toBe("active");

    await expect(
      consentService.revoke(grant.id, {
        ownerUserId: seeker.userId,
        reason: "not owner"
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    const revoked = await consentService.revoke(grant.id, {
      ownerUserId: provider.userId,
      reason: "No longer needed"
    });
    expect(revoked.status).toBe("revoked");
  });

  it("blocks can-view after revoke", async () => {
    const seeker = await authenticate(guard, SEEKER_TOKEN);
    const provider = await authenticate(guard, PROVIDER_TOKEN);

    const grant = await consentService.grant(ACCESS_REQUEST_ID, {
      ownerUserId: provider.userId,
      grantedFields: [ConsentField.PHONE],
      purpose: "booking coordination"
    });

    const beforeRevoke = await consentService.canView({
      actorUserId: seeker.userId,
      ownerUserId: provider.userId,
      field: ConsentField.PHONE
    });
    expect(beforeRevoke).toEqual({ allowed: true });

    await consentService.revoke(grant.id, {
      ownerUserId: provider.userId,
      reason: "No longer needed"
    });

    const afterRevoke = await consentService.canView({
      actorUserId: seeker.userId,
      ownerUserId: provider.userId,
      field: ConsentField.PHONE
    });
    expect(afterRevoke).toEqual({ allowed: false });
  });
});

async function authenticate(
  guard: KeycloakJwtGuard,
  token: string
): Promise<AuthenticatedUser> {
  const request: {
    headers: Record<string, string | undefined>;
    user?: AuthenticatedUser;
  } = {
    headers: {
      authorization: `Bearer ${token}`
    }
  };

  const context = buildExecutionContext(request);
  const activated = await guard.canActivate(context);
  expect(activated).toBe(true);
  expect(request.user).toBeDefined();
  return request.user as AuthenticatedUser;
}
