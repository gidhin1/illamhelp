import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Min } from "class-validator";

const MODERATION_STAGES = ["technical_validation", "ai_review", "human_review"] as const;
const MODERATION_STATUSES = ["pending", "running", "approved", "rejected", "error"] as const;

export type ModerationStageFilter = (typeof MODERATION_STAGES)[number];
export type ModerationStatusFilter = (typeof MODERATION_STATUSES)[number];

export class AdminListModerationQueueDto {
  @IsOptional()
  @IsIn(MODERATION_STAGES)
  stage?: ModerationStageFilter;

  @IsOptional()
  @IsIn(MODERATION_STATUSES)
  status?: ModerationStatusFilter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
