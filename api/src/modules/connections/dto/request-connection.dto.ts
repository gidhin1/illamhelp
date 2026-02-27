import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class RequestConnectionDto {
  @ApiPropertyOptional({
    example: "9f65f514-12d9-4d8c-95e2-7b497f9e150d",
    format: "uuid"
  })
  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @ApiPropertyOptional({
    example: "anita plumber kochi",
    description: "Name, member ID, service type, location, or combined search text"
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  targetQuery?: string;
}
