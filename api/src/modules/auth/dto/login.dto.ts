import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({
    example: "anita_worker_01",
    minLength: 3,
    maxLength: 120
  })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  username!: string;

  @ApiProperty({
    example: "StrongPass#2026",
    minLength: 8,
    maxLength: 128
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
