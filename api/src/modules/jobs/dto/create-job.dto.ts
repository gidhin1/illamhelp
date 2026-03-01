import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";

export enum JobVisibilityDto {
  Public = "public",
  ConnectionsOnly = "connections_only"
}

export class CreateJobDto {
  @ApiProperty({
    example: "plumber",
    minLength: 2,
    maxLength: 64
  })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  category!: string;

  @ApiProperty({
    example: "Kitchen sink leakage repair",
    minLength: 4,
    maxLength: 120
  })
  @IsString()
  @MinLength(4)
  @MaxLength(120)
  title!: string;

  @ApiProperty({
    example: "Need an experienced plumber to repair sink leakage in apartment.",
    minLength: 10,
    maxLength: 1000
  })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description!: string;

  @ApiProperty({
    example: "Kakkanad, Kochi",
    minLength: 2,
    maxLength: 160
  })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  locationText!: string;

  @ApiProperty({
    enum: JobVisibilityDto,
    example: JobVisibilityDto.Public,
    description: "Who can discover and request this job"
  })
  @IsEnum(JobVisibilityDto)
  visibility!: JobVisibilityDto;

  @ApiPropertyOptional({
    description: "Optional geo latitude for location-based search",
    example: 10.0159
  })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  locationLatitude?: number;

  @ApiPropertyOptional({
    description: "Optional geo longitude for location-based search",
    example: 76.3419
  })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  locationLongitude?: number;
}
