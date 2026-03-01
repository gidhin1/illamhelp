import { Transform } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min
} from "class-validator";

export class AdminMemberTimelineQueryDto {
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  memberId!: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    return Number(value);
  })
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
