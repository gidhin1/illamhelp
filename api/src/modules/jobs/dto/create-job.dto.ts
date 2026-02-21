import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

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
}
