import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../common/database/database.service";
import type { OpaService } from "../../common/policy/opa.service";
import type { AuditService } from "../audit/audit.service";
import { ConsentField } from "./dto/consent-field.enum";
import { ConsentService } from "./consent.service";

describe("ConsentService canView", () => {
  it("returns false when no active grant exists", async () => {
    const dbMock = {
      query: vi.fn().mockImplementation((sql: string) => {
        // UUID existence checks for resolveInternalUserId
        if (sql.includes("FROM users WHERE id = $1::uuid")) {
          return Promise.resolve({ rowCount: 1, rows: [{ id: "test-id" }] });
        }
        // canView grant query
        return Promise.resolve({ rowCount: 0, rows: [] });
      })
    } as unknown as DatabaseService;
    const opaMock = {
      canViewPii: vi.fn()
    } as unknown as OpaService;
    const auditMock = {
      logEvent: vi.fn()
    } as unknown as AuditService;

    const service = new ConsentService(dbMock, opaMock, auditMock);
    const result = await service.canView({
      actorUserId: "22222222-2222-4222-8222-222222222222",
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      field: ConsentField.PHONE
    });

    expect(result).toEqual({ allowed: false });
    expect(opaMock.canViewPii).not.toHaveBeenCalled();
    expect(auditMock.logEvent).toHaveBeenCalledTimes(1);
  });

  it("delegates allow decision to OPA when grant exists", async () => {
    let callCount = 0;
    const dbMock = {
      query: vi.fn().mockImplementation((sql: string) => {
        // UUID existence checks for resolveInternalUserId
        if (sql.includes("FROM users WHERE id = $1::uuid")) {
          return Promise.resolve({ rowCount: 1, rows: [{ id: "test-id" }] });
        }
        // canView grant query
        return Promise.resolve({
          rowCount: 1,
          rows: [
            {
              relationship_status: "accepted",
              grant_status: "active",
              granted_fields: ["phone"],
              expires_at: null
            }
          ]
        });
      })
    } as unknown as DatabaseService;
    const opaMock = {
      canViewPii: vi.fn().mockResolvedValue(true)
    } as unknown as OpaService;
    const auditMock = {
      logEvent: vi.fn()
    } as unknown as AuditService;

    const service = new ConsentService(dbMock, opaMock, auditMock);
    const result = await service.canView({
      actorUserId: "22222222-2222-4222-8222-222222222222",
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      field: ConsentField.PHONE
    });

    expect(result).toEqual({ allowed: true });
    expect(opaMock.canViewPii).toHaveBeenCalledTimes(1);
    expect(auditMock.logEvent).toHaveBeenCalledTimes(1);
  });

  it("returns false when grant has expired (BUG-012 regression test)", async () => {
    // The SQL WHERE clause now includes `AND (g.expires_at IS NULL OR g.expires_at > now())`,
    // so expired grants return 0 rows — same as "no active grant".
    const dbMock = {
      query: vi.fn().mockImplementation((sql: string) => {
        // UUID existence checks for resolveInternalUserId
        if (sql.includes("FROM users WHERE id = $1::uuid")) {
          return Promise.resolve({ rowCount: 1, rows: [{ id: "test-id" }] });
        }
        // canView grant query — returns 0 rows (expired grant filtered out)
        return Promise.resolve({ rowCount: 0, rows: [] });
      })
    } as unknown as DatabaseService;
    const opaMock = {
      canViewPii: vi.fn()
    } as unknown as OpaService;
    const auditMock = {
      logEvent: vi.fn()
    } as unknown as AuditService;

    const service = new ConsentService(dbMock, opaMock, auditMock);
    const result = await service.canView({
      actorUserId: "22222222-2222-4222-8222-222222222222",
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      field: ConsentField.PHONE
    });

    expect(result).toEqual({ allowed: false });
    expect(opaMock.canViewPii).not.toHaveBeenCalled();

    // Verify the SQL query includes the expires_at check
    // calls[0] and calls[1] are UUID existence checks for resolveInternalUserId
    // calls[2] is the actual canView grant query
    const queryCall = vi.mocked(dbMock.query).mock.calls[2];
    const sqlString = queryCall[0] as string;
    expect(sqlString).toContain("expires_at IS NULL OR g.expires_at > now()");
  });
});

describe("ConsentService revokeAllForConnection", () => {
  const CONNECTION_ID = "33333333-3333-4333-8333-333333333333";

  it("revokes all active grants and returns count", async () => {
    const dbMock = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          {
            id: "grant-1",
            owner_user_id: "11111111-1111-4111-8111-111111111111",
            grantee_user_id: "22222222-2222-4222-8222-222222222222",
            connection_id: CONNECTION_ID,
            granted_fields: ["phone"],
            purpose: "contact",
            status: "revoked",
            granted_at: new Date(),
            expires_at: null,
            revoked_at: new Date(),
            revoke_reason: "Connection blocked"
          },
          {
            id: "grant-2",
            owner_user_id: "22222222-2222-4222-8222-222222222222",
            grantee_user_id: "11111111-1111-4111-8111-111111111111",
            connection_id: CONNECTION_ID,
            granted_fields: ["email"],
            purpose: "contact",
            status: "revoked",
            granted_at: new Date(),
            expires_at: null,
            revoked_at: new Date(),
            revoke_reason: "Connection blocked"
          }
        ]
      })
    } as unknown as DatabaseService;
    const opaMock = {} as unknown as OpaService;
    const auditMock = {
      logEvent: vi.fn().mockResolvedValue(undefined)
    } as unknown as AuditService;

    const service = new ConsentService(dbMock, opaMock, auditMock);
    const count = await service.revokeAllForConnection(CONNECTION_ID, "Connection blocked");

    expect(count).toBe(2);
    expect(auditMock.logEvent).toHaveBeenCalledTimes(2);

    const sql = vi.mocked(dbMock.query).mock.calls[0][0] as string;
    expect(sql).toContain("UPDATE pii_consent_grants");
    expect(sql).toContain("status = 'revoked'");
    expect(sql).toContain("connection_id = $1::uuid");
  });

  it("returns 0 when no active grants exist", async () => {
    const dbMock = {
      query: vi.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] })
    } as unknown as DatabaseService;
    const opaMock = {} as unknown as OpaService;
    const auditMock = {
      logEvent: vi.fn()
    } as unknown as AuditService;

    const service = new ConsentService(dbMock, opaMock, auditMock);
    const count = await service.revokeAllForConnection(CONNECTION_ID, "Connection blocked");

    expect(count).toBe(0);
    expect(auditMock.logEvent).not.toHaveBeenCalled();
  });
});
