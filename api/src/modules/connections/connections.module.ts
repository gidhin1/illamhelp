import { Module } from "@nestjs/common";

import { ConsentModule } from "../consent/consent.module";
import { ConnectionsController } from "./connections.controller";
import { ConnectionsService } from "./connections.service";

@Module({
  imports: [ConsentModule],
  controllers: [ConnectionsController],
  providers: [ConnectionsService],
  exports: [ConnectionsService]
})
export class ConnectionsModule { }
