import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsUUID } from "class-validator";

import { ConsentField } from "./consent-field.enum";

export class CheckConsentVisibilityDto {
  @ApiProperty({
    example: "1d21af8d-2700-4fbb-926f-163d4f963f73",
    format: "uuid"
  })
  @IsUUID()
  ownerUserId!: string;

  @ApiProperty({
    enum: ConsentField,
    example: ConsentField.PHONE
  })
  @IsEnum(ConsentField)
  field!: ConsentField;
}
