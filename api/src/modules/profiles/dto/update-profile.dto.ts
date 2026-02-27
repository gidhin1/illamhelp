import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from "class-validator";

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: "Anita", minLength: 2, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ example: "K", maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ example: "Kochi", maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ example: "Kakkanad", maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  area?: string;

  @ApiPropertyOptional({
    example: ["plumber", "electrician"],
    type: [String],
    maxItems: 20
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(40, { each: true })
  serviceCategories?: string[];

  @ApiPropertyOptional({ example: "anita.worker@example.com", format: "email" })
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;

  @ApiPropertyOptional({
    example: "+919876543210",
    minLength: 8,
    maxLength: 20,
    pattern: "^[+0-9][0-9\\s-]{7,19}$"
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(/^[+0-9][0-9\s-]{7,19}$/)
  phone?: string;

  @ApiPropertyOptional({
    example: "+919812345678",
    minLength: 8,
    maxLength: 20,
    pattern: "^[+0-9][0-9\\s-]{7,19}$"
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(/^[+0-9][0-9\s-]{7,19}$/)
  alternatePhone?: string;

  @ApiPropertyOptional({ example: "Flat 10B, Green Meadows, Kakkanad, Kochi", maxLength: 240 })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(240)
  fullAddress?: string;
}
