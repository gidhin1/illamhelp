import { Module } from "@nestjs/common";

import { ConsentModule } from "../consent/consent.module";
import { MediaModule } from "../media/media.module";
import { NotificationModule } from "../notifications/notification.module";
import { ConnectionsController } from "./connections.controller";
import { ConnectionsService } from "./connections.service";

@Module({
  imports: [ConsentModule, NotificationModule, MediaModule],
  controllers: [ConnectionsController],
  providers: [ConnectionsService],
  exports: [ConnectionsService]
})
export class ConnectionsModule { }
