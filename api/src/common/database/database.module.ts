import { Global, Module } from "@nestjs/common";

import { OpaService } from "../policy/opa.service";
import { DatabaseService } from "./database.service";

@Global()
@Module({
  providers: [DatabaseService, OpaService],
  exports: [DatabaseService, OpaService]
})
export class DatabaseModule {}
