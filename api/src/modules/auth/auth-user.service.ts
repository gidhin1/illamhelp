import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { assertUuid } from "../../common/utils/uuid";
import { AppRole } from "./interfaces/authenticated-user.interface";

@Injectable()
export class AuthUserService {
  constructor(private readonly databaseService: DatabaseService) { }

  async syncUserFromToken(
    userId: string,
    roles: AppRole[],
    publicUserId?: string
  ): Promise<void> {
    assertUuid(userId, "token.sub");
    const role = this.resolvePrimaryRole(roles);
    const normalizedPublicUserId = this.normalizePublicUserId(publicUserId, userId);

    await this.databaseService.query(
      `
      INSERT INTO users (id, role, username)
      VALUES ($1::uuid, $2::user_role, $3::text)
      ON CONFLICT (id)
      DO UPDATE SET
        role = EXCLUDED.role,
        username = COALESCE(NULLIF(EXCLUDED.username, ''), users.username),
        updated_at = now()
      `,
      [userId, role, normalizedPublicUserId]
    );
  }

  async getUsernameByUserId(userId: string): Promise<string | null> {
    assertUuid(userId, "userId");
    const result = await this.databaseService.query<{ username: string | null }>(
      `SELECT username FROM users WHERE id = $1::uuid`,
      [userId]
    );
    return result.rows[0]?.username ?? null;
  }

  private resolvePrimaryRole(roles: AppRole[]): AppRole | "both" {
    if (roles.includes("admin")) {
      return "admin";
    }
    if (roles.includes("support")) {
      return "support";
    }
    return "both";
  }

  private normalizePublicUserId(value: string | undefined, userId: string): string {
    const raw = (value ?? "").trim().toLowerCase();
    if (raw.length >= 3 && raw.length <= 40 && /^[a-z0-9._-]+$/.test(raw)) {
      return raw;
    }
    return `member_${userId.replace(/-/g, "").slice(0, 10).toLowerCase()}`;
  }
}
