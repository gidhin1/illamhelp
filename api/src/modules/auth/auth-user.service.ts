import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { assertUuid } from "../../common/utils/uuid";
import { AppRole } from "./interfaces/authenticated-user.interface";

@Injectable()
export class AuthUserService {
  constructor(private readonly databaseService: DatabaseService) {}

  async syncUserFromToken(userId: string, roles: AppRole[]): Promise<void> {
    assertUuid(userId, "token.sub");
    const role = this.resolvePrimaryRole(roles);

    await this.databaseService.query(
      `
      INSERT INTO users (id, role)
      VALUES ($1::uuid, $2::user_role)
      ON CONFLICT (id)
      DO UPDATE SET role = EXCLUDED.role, updated_at = now()
      `,
      [userId, role]
    );
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
}
