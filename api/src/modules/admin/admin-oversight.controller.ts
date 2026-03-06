import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { ProfileRecord, ProfilesService } from "../profiles/profiles.service";
import { ReviewVerificationDto } from "../profiles/dto/review-verification.dto";
import { VerificationRecord, VerificationService } from "../profiles/verification.service";
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
    private readonly profilesService: ProfilesService,
    private readonly verificationService: VerificationService
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

  @Get("verifications")
  listVerifications(
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ): Promise<{
    items: VerificationRecord[];
    total: number;
    limit: number;
    offset: number;
  }> {
    return this.verificationService.listForAdmin({
      status: status as "pending" | "under_review" | "approved" | "rejected" | undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined
    });
  }

  @Post("verifications/:id/review")
  reviewVerification(
    @Param("id") requestId: string,
    @Body() body: ReviewVerificationDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<VerificationRecord> {
    return this.verificationService.review(requestId, {
      actorUserId: user.userId,
      decision: body.decision,
      notes: body.notes
    });
  }
}
