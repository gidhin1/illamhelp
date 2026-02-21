import { IsEnum, IsUUID } from "class-validator";

import { ConsentField } from "./consent-field.enum";

export class CheckConsentVisibilityDto {
  @IsUUID()
  ownerUserId!: string;

  @IsEnum(ConsentField)
  field!: ConsentField;
}
