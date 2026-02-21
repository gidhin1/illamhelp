import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class RequestConnectionDto {
  @ApiProperty({
    example: "9f65f514-12d9-4d8c-95e2-7b497f9e150d",
    format: "uuid"
  })
  @IsUUID()
  targetUserId!: string;
}
