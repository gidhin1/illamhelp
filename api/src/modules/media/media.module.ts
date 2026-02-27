import { Module } from "@nestjs/common";

import { InternalEventsModule } from "../../common/events/internal-events.module";
import { AuditModule } from "../audit/audit.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";

@Module({
  imports: [AuditModule, InternalEventsModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService]
})
export class MediaModule {}
