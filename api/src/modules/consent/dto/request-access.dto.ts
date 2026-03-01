import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength
} from "class-validator";

import { ConsentField } from "./consent-field.enum";

export class RequestAccessDto {
  @ApiProperty({
    example: "anita.k",
    description: "Public member user ID (username)"
  })
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  ownerUserId!: string;

  @ApiProperty({
    example: "2b0e7ceb-45c8-43cc-ad03-b5b6e1fb32df",
    format: "uuid"
  })
  @IsUUID()
  connectionId!: string;

  @ApiProperty({
    enum: ConsentField,
    isArray: true,
    example: [ConsentField.PHONE, ConsentField.EMAIL]
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ConsentField, { each: true })
  requestedFields!: ConsentField[];

  @ApiProperty({
    example: "Share contact details to discuss maid service requirements.",
    minLength: 3,
    maxLength: 200
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  purpose!: string;
}
