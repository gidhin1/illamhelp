import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RequestConnectionDto {
  @ApiPropertyOptional({
    example: "anita.k",
    description: "Public member user ID (username)"
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(40)
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
