import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateJobDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  category!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  locationText!: string;
}
