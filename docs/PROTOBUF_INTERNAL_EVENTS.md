# Protobuf for Internal Events

## Decision

- Public client APIs remain JSON/REST.
- Internal service/event contracts use Protobuf where it provides clear value.

## Scope Implemented (Phase 2)

- Protobuf schema files added under:
  - `proto/internal/events/v1/media_events.proto`
  - `proto/internal/events/v1/consent_events.proto`
- Protobuf binary codecs implemented in API:
  - `api/src/common/events/protobuf/internal-events.codec.ts`
  - `api/src/common/events/protobuf/wire.ts`
- Internal outbox table added for binary event storage:
  - `infra/db/migrations/0004_internal_event_outbox.sql`
- API internal event writer service:
  - `api/src/common/events/internal-events.service.ts`
- Media module now emits protobuf-backed internal events to outbox:
  - `internal.media.upload_ticket_issued` (`v1`)
  - `internal.media.upload_completed` (`v1`)

## Why this hybrid model

- JSON remains best for browser/mobile and debugging.
- Protobuf reduces payload size and enforces strict contracts for async internal pipelines.
- Outbox pattern gives reliability for future workers/consumers (NATS JetStream).

## Current Event Lifecycle

1. API handles request (JSON).
2. Domain action persists normal relational data.
3. API writes an outbox row containing:
   - `payload_protobuf` (binary)
   - `payload_json` (debug/audit readability)
   - `event_name`, `event_version`, `status`
4. Future publisher worker can read pending rows and publish to NATS.

## Next Steps

1. Add outbox publisher worker (`pending -> published|failed`) with retry policy.
2. Publish protobuf payloads to NATS JetStream subjects by event name/version.
3. Add consumer-side protobuf decoders in moderation and notification workers.
4. Add metrics: pending backlog size, publish latency, failure rate.
