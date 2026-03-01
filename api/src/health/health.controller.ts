import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";

import { Public } from "../modules/auth/decorators/public.decorator";
import { DatabaseService } from "../common/database/database.service";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService
  ) { }

  @Public()
  @Get()
  async health(): Promise<{ status: string; timestamp: string; db: string }> {
    let dbStatus = "up";
    try {
      await this.databaseService.query("SELECT 1");
    } catch {
      dbStatus = "down";
    }

    const result = {
      status: dbStatus === "up" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      db: dbStatus
    };

    if (dbStatus !== "up") {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}
