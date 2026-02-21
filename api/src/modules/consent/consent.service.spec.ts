import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../common/database/database.service";
import type { OpaService } from "../../common/policy/opa.service";
import type { AuditService } from "../audit/audit.service";
import { ConsentField } from "./dto/consent-field.enum";
import { ConsentService } from "./consent.service";

describe("ConsentService canView", () => {
  it("returns false when no active grant exists", async () => {
    const dbMock = {
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] })
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
    const dbMock = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [
          {
            relationship_status: "accepted",
            grant_status: "active",
            granted_fields: ["phone"],
            expires_at: null
          }
        ]
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
});
