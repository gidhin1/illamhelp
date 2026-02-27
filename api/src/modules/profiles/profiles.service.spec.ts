import type { ConfigService } from "@nestjs/config";
import type { QueryResult } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../common/database/database.service";
import { ConsentField } from "../consent/dto/consent-field.enum";
import type { ConsentService } from "../consent/consent.service";
import { ProfilesService } from "./profiles.service";

const OWNER_USER_ID = "11111111-1111-4111-8111-111111111111";
const VIEWER_USER_ID = "22222222-2222-4222-8222-222222222222";

function createConfigService(
  overrides: Record<string, string> = {}
): ConfigService {
  const values: Record<string, string> = {
    PROFILE_PII_ENCRYPTION_KEY: "phase2_profile_encryption_key_32_chars",
    ...overrides
  };

  return {
    get<T>(propertyPath: string, defaultValue?: T): T {
      const value = values[propertyPath];
      return (value === undefined ? defaultValue : (value as unknown as T)) as T;
    }
  } as ConfigService;
}

function queryResult<T extends Record<string, unknown>>(
  rows: T[]
): QueryResult<T> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows
  } as QueryResult<T>;
}

describe("ProfilesService consent-aware reads", () => {
  let queryMock: ReturnType<typeof vi.fn>;
  let canViewMock: ReturnType<typeof vi.fn>;
  let service: ProfilesService;

  beforeEach(() => {
    queryMock = vi.fn();
    canViewMock = vi.fn();

    service = new ProfilesService(
      { query: queryMock } as unknown as DatabaseService,
      { canView: canViewMock } as unknown as ConsentService,
      createConfigService()
    );
  });

  function profileRow() {
    return {
      user_id: OWNER_USER_ID,
      first_name: "Anita",
      last_name: "K",
      city: "Kochi",
      area: "Kakkanad",
      service_categories: ["plumber"],
      rating_average: 4.8,
      rating_count: 9,
      email_masked: "a***@example.com",
      phone_masked: "**********10",
      pii_email_encrypted: Buffer.from("anita@example.com", "utf8"),
      pii_phone_encrypted: Buffer.from("+919876543210", "utf8"),
      pii_alternate_phone_encrypted: Buffer.from("+919812345678", "utf8"),
      pii_full_address_encrypted: Buffer.from("Flat 10B, Kakkanad", "utf8")
    };
  }

  it("returns full contact details to profile owner", async () => {
    queryMock
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([profileRow()]));

    const profile = await service.getOwnProfile(OWNER_USER_ID);

    expect(profile.userId).toBe(OWNER_USER_ID);
    expect(profile.contact.email).toBe("anita@example.com");
    expect(profile.contact.phone).toBe("+919876543210");
    expect(profile.contact.alternatePhone).toBe("+919812345678");
    expect(profile.contact.fullAddress).toBe("Flat 10B, Kakkanad");
    expect(profile.visibility).toEqual({
      email: true,
      phone: true,
      alternatePhone: true,
      fullAddress: true
    });
    expect(canViewMock).not.toHaveBeenCalled();
  });

  it("masks all contact fields when viewer has no consent", async () => {
    queryMock
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([profileRow()]));
    canViewMock.mockResolvedValue({ allowed: false });

    const profile = await service.getProfileForViewer(
      OWNER_USER_ID,
      VIEWER_USER_ID
    );

    expect(canViewMock).toHaveBeenCalledTimes(4);
    expect(canViewMock).toHaveBeenNthCalledWith(1, {
      actorUserId: VIEWER_USER_ID,
      ownerUserId: OWNER_USER_ID,
      field: ConsentField.EMAIL
    });
    expect(canViewMock).toHaveBeenNthCalledWith(2, {
      actorUserId: VIEWER_USER_ID,
      ownerUserId: OWNER_USER_ID,
      field: ConsentField.PHONE
    });
    expect(canViewMock).toHaveBeenNthCalledWith(3, {
      actorUserId: VIEWER_USER_ID,
      ownerUserId: OWNER_USER_ID,
      field: ConsentField.ALTERNATE_PHONE
    });
    expect(canViewMock).toHaveBeenNthCalledWith(4, {
      actorUserId: VIEWER_USER_ID,
      ownerUserId: OWNER_USER_ID,
      field: ConsentField.FULL_ADDRESS
    });

    expect(profile.contact.email).toBeNull();
    expect(profile.contact.phone).toBeNull();
    expect(profile.contact.alternatePhone).toBeNull();
    expect(profile.contact.fullAddress).toBeNull();
    expect(profile.contact.emailMasked).toBe("a***@example.com");
    expect(profile.contact.phoneMasked).toBe("**********10");
    expect(profile.visibility).toEqual({
      email: false,
      phone: false,
      alternatePhone: false,
      fullAddress: false
    });
  });

  it("reveals only consented field(s) for non-owner viewers", async () => {
    queryMock
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([profileRow()]));
    canViewMock
      .mockResolvedValueOnce({ allowed: false })
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false })
      .mockResolvedValueOnce({ allowed: false });

    const profile = await service.getProfileForViewer(
      OWNER_USER_ID,
      VIEWER_USER_ID
    );

    expect(profile.contact.email).toBeNull();
    expect(profile.contact.phone).toBe("+919876543210");
    expect(profile.contact.alternatePhone).toBeNull();
    expect(profile.contact.fullAddress).toBeNull();
    expect(profile.visibility).toEqual({
      email: false,
      phone: true,
      alternatePhone: false,
      fullAddress: false
    });
  });
});
