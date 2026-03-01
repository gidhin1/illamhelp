import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { AdminListModerationQueueDto } from "./dto/admin-list-moderation-queue.dto";
import { AdminProcessModerationDto } from "./dto/admin-process-moderation.dto";
import { AdminReviewMediaDto } from "./dto/admin-review-media.dto";
import {
  MediaModerationDetails,
  MediaModerationService,
  ModerationBatchResult,
  ModerationQueueItem
} from "./media-moderation.service";
import { MediaAssetRecord } from "./media.service";

@Controller("admin/media")
@UseGuards(RolesGuard)
@Roles("admin", "support")
export class AdminMediaController {
  constructor(private readonly mediaModerationService: MediaModerationService) {}

  @Get("moderation-queue")
  listModerationQueue(
    @Query() query: AdminListModerationQueueDto
  ): Promise<ModerationQueueItem[]> {
    return this.mediaModerationService.listModerationQueue({
      stage: query.stage,
      status: query.status,
      limit: query.limit ?? 50
    });
  }

  @Get(":mediaId/moderation")
  getModerationDetails(@Param("mediaId") mediaId: string): Promise<MediaModerationDetails> {
    return this.mediaModerationService.getModerationDetails(mediaId);
  }

  @Post("moderation/process")
  processModerationBatch(
    @Body() body: AdminProcessModerationDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ModerationBatchResult> {
    return this.mediaModerationService.processPendingJobs({
      limit: body.limit ?? 10,
      actorUserId: user.userId
    });
  }

  @Post(":mediaId/review")
  reviewMedia(
    @Param("mediaId") mediaId: string,
    @Body() body: AdminReviewMediaDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MediaAssetRecord> {
    return this.mediaModerationService.reviewMedia({
      mediaId,
      moderatorUserId: user.userId,
      decision: body.decision,
      reasonCode: body.reasonCode,
      notes: body.notes
    });
  }
}
