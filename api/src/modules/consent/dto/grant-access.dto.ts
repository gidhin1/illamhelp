import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";

import { ConsentField } from "./consent-field.enum";

export class GrantAccessDto {
  @ApiProperty({
    enum: ConsentField,
    isArray: true,
    example: [ConsentField.PHONE, ConsentField.EMAIL]
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ConsentField, { each: true })
  grantedFields!: ConsentField[];

  @ApiPropertyOptional({
    example: "2026-12-31T23:59:59.000Z",
    format: "date-time"
  })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiProperty({
    example: "Approved for one-time discussion on plumbing service.",
    minLength: 3,
    maxLength: 200
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  purpose!: string;
}
