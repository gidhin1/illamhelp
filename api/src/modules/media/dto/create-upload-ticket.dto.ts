import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min
} from "class-validator";

export const MEDIA_KINDS = ["image", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export class CreateUploadTicketDto {
  @IsString()
  @IsIn(MEDIA_KINDS)
  kind!: MediaKind;

  @IsString()
  @Matches(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i)
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(1024 * 1024 * 1024)
  fileSizeBytes!: number;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  checksumSha256!: string;

  @IsString()
  @Matches(/^[^/\\]+$/)
  originalFileName!: string;

  @IsOptional()
  @IsUUID()
  jobId?: string;
}
