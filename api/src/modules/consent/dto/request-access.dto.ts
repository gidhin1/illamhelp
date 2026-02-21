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
  @IsUUID()
  ownerUserId!: string;

  @IsUUID()
  connectionId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ConsentField, { each: true })
  requestedFields!: ConsentField[];

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  purpose!: string;
}
