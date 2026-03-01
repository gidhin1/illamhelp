import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

const REVIEW_DECISIONS = ["approved", "rejected"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export class AdminReviewMediaDto {
  @IsString()
  @IsIn(REVIEW_DECISIONS)
  decision!: ReviewDecision;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_:-]{2,80}$/i)
  reasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
