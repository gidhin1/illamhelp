import { Module } from "@nestjs/common";

import { ConsentModule } from "../consent/consent.module";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";

@Module({
  imports: [ConsentModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService]
})
export class ProfilesModule {}
