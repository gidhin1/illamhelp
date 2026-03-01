import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/database/database.module";
import { ProfilesModule } from "../profiles/profiles.module";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AdminOversightController } from "./admin-oversight.controller";
import { AdminOversightService } from "./admin-oversight.service";

@Module({
  imports: [DatabaseModule, ProfilesModule],
  controllers: [AdminOversightController],
  providers: [AdminOversightService, RolesGuard],
  exports: [AdminOversightService]
})
export class AdminModule { }
