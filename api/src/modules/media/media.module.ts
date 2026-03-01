import { Module } from "@nestjs/common";

import { InternalEventsModule } from "../../common/events/internal-events.module";
import { AuditModule } from "../audit/audit.module";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AdminMediaController } from "./admin-media.controller";
import { MediaController } from "./media.controller";
import { MediaModerationService } from "./media-moderation.service";
import { MediaModerationWorker } from "./media-moderation.worker";
import { MediaService } from "./media.service";

@Module({
  imports: [AuditModule, InternalEventsModule],
  controllers: [MediaController, AdminMediaController],
  providers: [MediaService, MediaModerationService, MediaModerationWorker, RolesGuard],
  exports: [MediaService, MediaModerationService]
})
export class MediaModule {}
