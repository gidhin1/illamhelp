import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RevokeAssignmentDto {
  @ApiPropertyOptional({
    example: "Need to assign another provider due availability mismatch",
    minLength: 2,
    maxLength: 240
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  reason?: string;
}
