import { Controller, Get } from "@nestjs/common";

import { Public } from "../modules/auth/decorators/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  health(): { status: string; timestamp: string } {
    return {
      status: "ok",
      timestamp: new Date().toISOString()
    };
  }
}
