import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class RevokeAccessDto {
  @ApiProperty({
    example: "User requested to stop sharing contact details.",
    minLength: 3,
    maxLength: 300
  })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
