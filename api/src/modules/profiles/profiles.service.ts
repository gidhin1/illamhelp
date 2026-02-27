import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { DatabaseService } from "../../common/database/database.service";
import { assertUuid } from "../../common/utils/uuid";
import { UserType } from "../auth/interfaces/user-type.enum";
import { ConsentService } from "../consent/consent.service";
import { ConsentField } from "../consent/dto/consent-field.enum";
import { UpdateProfileDto } from "./dto/update-profile.dto";

interface UpsertProfileInput {
  userId: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  userType: UserType;
}

interface DbProfileRow {
  user_id: string;
  first_name: string;
  last_name: string | null;
  city: string | null;
  area: string | null;
  service_categories: string[] | null;
  rating_average: number | null;
  rating_count: number | null;
  email_masked: string | null;
  phone_masked: string | null;
  pii_email_encrypted: Buffer | null;
  pii_phone_encrypted: Buffer | null;
  pii_alternate_phone_encrypted: Buffer | null;
  pii_full_address_encrypted: Buffer | null;
}

interface ContactVisibility {
  email: boolean;
  phone: boolean;
  alternatePhone: boolean;
  fullAddress: boolean;
}

interface ContactPayload {
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  fullAddress: string | null;
  emailMasked: string | null;
  phoneMasked: string | null;
}

export interface ProfileRecord {
  userId: string;
  firstName: string;
  lastName: string | null;
  displayName: string;
  city: string | null;
  area: string | null;
  serviceCategories: string[];
  ratingAverage: number | null;
  ratingCount: number;
  contact: ContactPayload;
  visibility: ContactVisibility;
}

@Injectable()
export class ProfilesService {
  private readonly piiEncryptionKey: Buffer;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly consentService: ConsentService,
    configService: ConfigService
  ) {
    const keyMaterial = configService.get<string>("PROFILE_PII_ENCRYPTION_KEY");
    if (!keyMaterial || keyMaterial.trim().length < 16) {
      throw new Error(
        "PROFILE_PII_ENCRYPTION_KEY is required and must be at least 16 characters"
      );
    }
    this.piiEncryptionKey = createHash("sha256").update(keyMaterial, "utf8").digest();
  }

  async upsertFromRegistration(input: UpsertProfileInput): Promise<void> {
    assertUuid(input.userId, "userId");

    const normalizedEmail = input.email?.trim().toLowerCase() || null;
    const normalizedPhone = input.phone?.trim() || null;
    const serviceCategories = this.defaultServiceCategories(input.userType);
    const encryptedEmail = this.encryptOptionalPii(normalizedEmail);
    const encryptedPhone = this.encryptOptionalPii(normalizedPhone);

    await this.databaseService.query(
      `
      UPDATE users
      SET
        email_masked = $2::text,
        phone_masked = $3::text,
        updated_at = now()
      WHERE id = $1::uuid
      `,
      [
        input.userId,
        normalizedEmail ? this.maskEmail(normalizedEmail) : null,
        normalizedPhone ? this.maskPhone(normalizedPhone) : null
      ]
    );

    await this.databaseService.query(
      `
      INSERT INTO profiles (
        user_id,
        first_name,
        last_name,
        service_categories,
        pii_email_encrypted,
        pii_phone_encrypted
      )
      VALUES (
        $1::uuid,
        $2::text,
        $3::text,
        $4::text[],
        $5::bytea,
        $6::bytea
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        service_categories = EXCLUDED.service_categories,
        pii_email_encrypted = COALESCE(EXCLUDED.pii_email_encrypted, profiles.pii_email_encrypted),
        pii_phone_encrypted = COALESCE(EXCLUDED.pii_phone_encrypted, profiles.pii_phone_encrypted),
        updated_at = now()
      `,
      [
        input.userId,
        input.firstName.trim(),
        input.lastName?.trim() || null,
        serviceCategories,
        encryptedEmail,
        encryptedPhone
      ]
    );
  }

  async getOwnProfile(userId: string): Promise<ProfileRecord> {
    return this.getProfileForViewer(userId, userId);
  }

  async updateOwnProfile(userId: string, payload: UpdateProfileDto): Promise<ProfileRecord> {
    assertUuid(userId, "userId");
    await this.ensureProfileRow(userId);
    const existing = await this.getProfileRow(userId);

    if (!existing) {
      throw new NotFoundException("Profile not found");
    }

    const mergedFirstName = payload.firstName?.trim() ?? existing.first_name;
    const mergedLastName = payload.lastName?.trim() ?? existing.last_name;
    const mergedCity = payload.city?.trim() ?? existing.city;
    const mergedArea = payload.area?.trim() ?? existing.area;
    const mergedServiceCategories =
      payload.serviceCategories !== undefined
        ? this.normalizeServiceCategories(payload.serviceCategories)
        : existing.service_categories ?? [];
    const existingEmail = this.decryptOptionalPii(existing.pii_email_encrypted);
    const existingPhone = this.decryptOptionalPii(existing.pii_phone_encrypted);
    const existingAlternatePhone = this.decryptOptionalPii(
      existing.pii_alternate_phone_encrypted
    );
    const existingFullAddress = this.decryptOptionalPii(existing.pii_full_address_encrypted);

    const mergedEmail = payload.email?.trim().toLowerCase() ?? existingEmail;
    const mergedPhone = payload.phone?.trim() ?? existingPhone;
    const mergedAlternatePhone =
      payload.alternatePhone?.trim() ?? existingAlternatePhone;
    const mergedFullAddress = payload.fullAddress?.trim() ?? existingFullAddress;

    const encryptedEmail = this.encryptOptionalPii(mergedEmail);
    const encryptedPhone = this.encryptOptionalPii(mergedPhone);
    const encryptedAlternatePhone = this.encryptOptionalPii(mergedAlternatePhone);
    const encryptedFullAddress = this.encryptOptionalPii(mergedFullAddress);

    await this.databaseService.query(
      `
      UPDATE profiles
      SET
        first_name = $2::text,
        last_name = $3::text,
        city = $4::text,
        area = $5::text,
        service_categories = $6::text[],
        pii_email_encrypted = $7::bytea,
        pii_phone_encrypted = $8::bytea,
        pii_alternate_phone_encrypted = $9::bytea,
        pii_full_address_encrypted = $10::bytea,
        updated_at = now()
      WHERE user_id = $1::uuid
      `,
      [
        userId,
        mergedFirstName,
        mergedLastName,
        mergedCity,
        mergedArea,
        mergedServiceCategories,
        encryptedEmail,
        encryptedPhone,
        encryptedAlternatePhone,
        encryptedFullAddress
      ]
    );

    await this.databaseService.query(
      `
      UPDATE users
      SET
        email_masked = $2::text,
        phone_masked = $3::text,
        updated_at = now()
      WHERE id = $1::uuid
      `,
      [
        userId,
        mergedEmail ? this.maskEmail(mergedEmail) : null,
        mergedPhone ? this.maskPhone(mergedPhone) : null
      ]
    );

    return this.getOwnProfile(userId);
  }

  async getProfileForViewer(ownerUserId: string, viewerUserId: string): Promise<ProfileRecord> {
    assertUuid(ownerUserId, "ownerUserId");
    assertUuid(viewerUserId, "viewerUserId");

    await this.ensureProfileRow(ownerUserId);
    const row = await this.getProfileRow(ownerUserId);
    if (!row) {
      throw new NotFoundException("Profile not found");
    }

    const visibility =
      ownerUserId === viewerUserId
        ? {
            email: true,
            phone: true,
            alternatePhone: true,
            fullAddress: true
          }
        : await this.resolveContactVisibility(ownerUserId, viewerUserId);

    return this.mapProfileRow(row, visibility);
  }

  private async resolveContactVisibility(
    ownerUserId: string,
    viewerUserId: string
  ): Promise<ContactVisibility> {
    const [email, phone, alternatePhone, fullAddress] = await Promise.all([
      this.consentService.canView({
        actorUserId: viewerUserId,
        ownerUserId,
        field: ConsentField.EMAIL
      }),
      this.consentService.canView({
        actorUserId: viewerUserId,
        ownerUserId,
        field: ConsentField.PHONE
      }),
      this.consentService.canView({
        actorUserId: viewerUserId,
        ownerUserId,
        field: ConsentField.ALTERNATE_PHONE
      }),
      this.consentService.canView({
        actorUserId: viewerUserId,
        ownerUserId,
        field: ConsentField.FULL_ADDRESS
      })
    ]);

    return {
      email: email.allowed,
      phone: phone.allowed,
      alternatePhone: alternatePhone.allowed,
      fullAddress: fullAddress.allowed
    };
  }

  private mapProfileRow(row: DbProfileRow, visibility: ContactVisibility): ProfileRecord {
    const displayName = [row.first_name, row.last_name]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value)
      .join(" ");

    return {
      userId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: displayName || "Member",
      city: row.city,
      area: row.area,
      serviceCategories: row.service_categories ?? [],
      ratingAverage: row.rating_average !== null ? Number(row.rating_average) : null,
      ratingCount: row.rating_count ?? 0,
      contact: {
        email: visibility.email ? this.decryptOptionalPii(row.pii_email_encrypted) : null,
        phone: visibility.phone ? this.decryptOptionalPii(row.pii_phone_encrypted) : null,
        alternatePhone: visibility.alternatePhone
          ? this.decryptOptionalPii(row.pii_alternate_phone_encrypted)
          : null,
        fullAddress: visibility.fullAddress
          ? this.decryptOptionalPii(row.pii_full_address_encrypted)
          : null,
        emailMasked: row.email_masked,
        phoneMasked: row.phone_masked
      },
      visibility
    };
  }

  private async ensureProfileRow(userId: string): Promise<void> {
    await this.databaseService.query(
      `
      INSERT INTO profiles (user_id, first_name, service_categories)
      VALUES ($1::uuid, 'Member'::text, '{}'::text[])
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId]
    );
  }

  private async getProfileRow(userId: string): Promise<DbProfileRow | undefined> {
    const result = await this.databaseService.query<DbProfileRow>(
      `
      SELECT
        p.user_id,
        p.first_name,
        p.last_name,
        p.city,
        p.area,
        p.service_categories,
        p.rating_average,
        p.rating_count,
        u.email_masked,
        u.phone_masked,
        p.pii_email_encrypted,
        p.pii_phone_encrypted,
        p.pii_alternate_phone_encrypted,
        p.pii_full_address_encrypted
      FROM profiles p
      JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1::uuid
      `,
      [userId]
    );

    if (!result.rowCount) {
      return undefined;
    }

    return result.rows[0];
  }

  private encryptOptionalPii(value: string | null | undefined): Buffer | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      return null;
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.piiEncryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(normalized, "utf8"),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    const payload = [
      "v1",
      iv.toString("base64url"),
      ciphertext.toString("base64url"),
      authTag.toString("base64url")
    ].join(":");

    return Buffer.from(payload, "utf8");
  }

  private decryptOptionalPii(value: Buffer | null | undefined): string | null {
    if (!value || value.length === 0) {
      return null;
    }

    const raw = value.toString("utf8");
    if (!raw.startsWith("v1:")) {
      // Backward compatibility for rows written before encryption was enabled.
      return raw;
    }

    const [, ivB64, ciphertextB64, authTagB64] = raw.split(":");
    if (!ivB64 || !ciphertextB64 || !authTagB64) {
      return null;
    }

    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.piiEncryptionKey,
        Buffer.from(ivB64, "base64url")
      );
      decipher.setAuthTag(Buffer.from(authTagB64, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextB64, "base64url")),
        decipher.final()
      ]);
      const valueText = plaintext.toString("utf8").trim();
      return valueText.length > 0 ? valueText : null;
    } catch {
      return null;
    }
  }

  private normalizeServiceCategories(values: string[]): string[] {
    const normalized = values
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);
    return [...new Set(normalized)].slice(0, 20);
  }

  private defaultServiceCategories(userType: UserType): string[] {
    if (userType === UserType.PROVIDER || userType === UserType.BOTH) {
      return ["home-services"];
    }
    return [];
  }

  private maskEmail(value: string): string {
    const trimmed = value.trim().toLowerCase();
    const [localPart, domainPart] = trimmed.split("@");
    if (!localPart || !domainPart) {
      return "***";
    }

    const visible = localPart.slice(0, 1);
    return `${visible}***@${domainPart}`;
  }

  private maskPhone(value: string): string {
    const compact = value.replace(/\s+/g, "");
    if (compact.length <= 2) {
      return "**";
    }
    const hidden = "*".repeat(Math.max(2, compact.length - 2));
    return `${hidden}${compact.slice(-2)}`;
  }
}
