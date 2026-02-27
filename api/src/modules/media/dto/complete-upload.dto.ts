import { IsOptional, IsString, Matches } from "class-validator";

export class CompleteUploadDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{32}$/i)
  etag?: string;
}
