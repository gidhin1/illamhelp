import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { assertUuid } from "../utils/uuid";

interface InternalEventInput {
  eventName: string;
  eventVersion?: string;
  actorUserId?: string;
  payloadProtobuf: Buffer;
  payloadJson: Record<string, unknown>;
  headers?: Record<string, unknown>;
}

@Injectable()
export class InternalEventsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async appendEvent(input: InternalEventInput): Promise<void> {
    if (input.actorUserId) {
      assertUuid(input.actorUserId, "actorUserId");
    }

    await this.databaseService.query(
      `
      INSERT INTO internal_event_outbox (
        event_name,
        event_version,
        actor_user_id,
        payload_protobuf,
        payload_json,
        headers
      )
      VALUES (
        $1::text,
        $2::text,
        $3::uuid,
        $4::bytea,
        $5::jsonb,
        $6::jsonb
      )
      `,
      [
        input.eventName,
        input.eventVersion ?? "v1",
        input.actorUserId ?? null,
        input.payloadProtobuf,
        JSON.stringify(input.payloadJson),
        JSON.stringify(input.headers ?? {})
      ]
    );
  }
}
