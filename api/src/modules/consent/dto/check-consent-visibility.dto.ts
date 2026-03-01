import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";

import { ConsentField } from "./consent-field.enum";

export class CheckConsentVisibilityDto {
  @ApiProperty({
    example: "anita.k",
    description: "Public member user ID (username)"
  })
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  ownerUserId!: string;

  @ApiProperty({
    enum: ConsentField,
    example: ConsentField.PHONE
  })
  @IsEnum(ConsentField)
  field!: ConsentField;
}
