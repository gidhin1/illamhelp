import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { assertUuid } from "../../common/utils/uuid";

export interface AuditEventInput {
  actorUserId?: string;
  targetUserId?: string;
  eventType: string;
  purpose?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly databaseService: DatabaseService) {}

  async logEvent(input: AuditEventInput): Promise<void> {
    if (input.actorUserId) {
      assertUuid(input.actorUserId, "actorUserId");
    }
    if (input.targetUserId) {
      assertUuid(input.targetUserId, "targetUserId");
    }

    await this.databaseService.query(
      `
      INSERT INTO audit_events (actor_user_id, target_user_id, event_type, purpose, metadata)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)
      `,
      [
        input.actorUserId ?? null,
        input.targetUserId ?? null,
        input.eventType,
        input.purpose ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );
  }
}
