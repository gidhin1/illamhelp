import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";

import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ProfileRecord, ProfilesService } from "../profiles/profiles.service";
import { AdminMemberTimelineQueryDto } from "./dto/admin-member-timeline-query.dto";
import {
  AdminMemberTimelineResponse,
  AdminOversightService
} from "./admin-oversight.service";

@Controller("admin/oversight")
@UseGuards(RolesGuard)
@Roles("admin", "support")
export class AdminOversightController {
  constructor(
    private readonly adminOversightService: AdminOversightService,
    private readonly profilesService: ProfilesService
  ) { }

  @Get("timeline")
  getMemberTimeline(
    @Query() query: AdminMemberTimelineQueryDto
  ): Promise<AdminMemberTimelineResponse> {
    return this.adminOversightService.getMemberTimeline({
      memberId: query.memberId,
      limit: query.limit ?? 50
    });
  }

  @Patch("members/:userId/verify")
  setVerified(
    @Param("userId") userId: string,
    @Body() body: { verified: boolean }
  ): Promise<ProfileRecord> {
    return this.profilesService.setVerified(userId, body.verified);
  }
}
