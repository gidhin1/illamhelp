import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RejectJobApplicationDto {
  @ApiPropertyOptional({
    example: "Quote is above budget",
    minLength: 2,
    maxLength: 240
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  reason?: string;
}
