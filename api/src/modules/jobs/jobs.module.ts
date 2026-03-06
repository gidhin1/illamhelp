import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { NotificationModule } from "../notifications/notification.module";
import { JobsController } from "./jobs.controller";
import { JobsSearchService } from "./jobs-search.service";
import { JobsService } from "./jobs.service";

@Module({
  imports: [AuditModule, NotificationModule],
  controllers: [JobsController],
  providers: [JobsService, JobsSearchService],
  exports: [JobsService]
})
export class JobsModule { }
