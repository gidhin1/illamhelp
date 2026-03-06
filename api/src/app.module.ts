import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";

import { DatabaseModule } from "./common/database/database.module";
import { HealthModule } from "./health/health.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ConnectionsModule } from "./modules/connections/connections.module";
import { ConsentModule } from "./modules/consent/consent.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { MediaModule } from "./modules/media/media.module";
import { NotificationModule } from "./modules/notifications/notification.module";
import { ProfilesModule } from "./modules/profiles/profiles.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(__dirname, "../../.env"),
        resolve(process.cwd(), ".env"),
        resolve(process.cwd(), "illamhelp/.env"),
        resolve(process.cwd(), "../.env")
      ]
    }),
    DatabaseModule,
    HealthModule,
    AdminModule,
    AuthModule,
    ProfilesModule,
    JobsModule,
    ConnectionsModule,
    ConsentModule,
    MediaModule,
    NotificationModule,
    AuditModule
  ]
})
export class AppModule { }
