import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from "class-validator";

export enum JobStatusFilter {
  Posted = "posted",
  Accepted = "accepted",
  InProgress = "in_progress",
  Completed = "completed",
  PaymentDone = "payment_done",
  PaymentReceived = "payment_received",
  Closed = "closed",
  Cancelled = "cancelled"
}

export enum JobVisibilityFilter {
  Public = "public",
  ConnectionsOnly = "connections_only"
}

export class SearchJobsDto {
  @ApiPropertyOptional({
    description: "Free-text search across title, description, category, and location",
    example: "plumber kakkanad"
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @ApiPropertyOptional({
    description: "Category filter",
    example: "plumber"
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @ApiPropertyOptional({
    description: "Location filter",
    example: "Kochi"
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  locationText?: string;

  @ApiPropertyOptional({
    description: "Minimum seeker rating",
    example: 4.2
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minSeekerRating?: number;

  @ApiPropertyOptional({
    description: "Filter by statuses (comma-separated or repeated query param)",
    enum: JobStatusFilter,
    isArray: true,
    example: ["posted", "accepted"]
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
    return undefined;
  })
  @IsEnum(JobStatusFilter, { each: true })
  statuses?: JobStatusFilter[];

  @ApiPropertyOptional({
    description: "Visibility filter",
    enum: JobVisibilityFilter,
    example: JobVisibilityFilter.Public
  })
  @IsOptional()
  @IsEnum(JobVisibilityFilter)
  visibility?: JobVisibilityFilter;

  @ApiPropertyOptional({
    description: "Geo latitude for radius search",
    example: 10.0159
  })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({
    description: "Geo longitude for radius search",
    example: 76.3419
  })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    description: "Geo radius in km (requires latitude + longitude)",
    example: 15
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  radiusKm?: number;

  @ApiPropertyOptional({
    description: "Result size limit",
    example: 20,
    default: 20
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}
