import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CancelBookingDto {
  @ApiPropertyOptional({
    example: "Customer requested reschedule",
    minLength: 2,
    maxLength: 240
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  reason?: string;
}
