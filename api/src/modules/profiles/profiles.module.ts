import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ConsentModule } from "../consent/consent.module";
import { MediaModule } from "../media/media.module";
import { NotificationModule } from "../notifications/notification.module";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";
import { VerificationService } from "./verification.service";

@Module({
  imports: [ConsentModule, AuditModule, NotificationModule, MediaModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, VerificationService],
  exports: [ProfilesService, VerificationService]
})
export class ProfilesModule { }
