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
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ConsentField, { each: true })
  grantedFields!: ConsentField[];

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  purpose!: string;
}
