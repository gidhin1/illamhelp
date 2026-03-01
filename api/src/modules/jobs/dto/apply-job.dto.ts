import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ApplyJobDto {
  @ApiPropertyOptional({
    example: "7 years experience in plumbing and available today.",
    minLength: 4,
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  message?: string;
}
