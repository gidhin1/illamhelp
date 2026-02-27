import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from "class-validator";

export class RegisterDto {
  @ApiPropertyOptional({
    example: "anita_worker_01",
    minLength: 3,
    maxLength: 64,
    pattern: "^[a-zA-Z0-9._-]+$"
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username?: string;

  @ApiProperty({
    example: "anita.worker@example.com",
    maxLength: 120,
    format: "email"
  })
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @ApiProperty({
    example: "StrongPass#2026",
    minLength: 8,
    maxLength: 128,
    description:
      "Must contain at least one uppercase letter, one lowercase letter, and one number."
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      "password must include at least one uppercase letter, one lowercase letter, and one number"
  })
  password!: string;

  @ApiProperty({
    example: "Anita",
    minLength: 2,
    maxLength: 80
  })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName!: string;

  @ApiPropertyOptional({
    example: "K",
    maxLength: 80
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({
    example: "+919876543210",
    minLength: 8,
    maxLength: 20,
    pattern: "^[+0-9][0-9\\s-]{7,19}$"
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(/^[+0-9][0-9\s-]{7,19}$/)
  phone?: string;

}
