import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { CompleteUploadDto } from "./dto/complete-upload.dto";
import { CreateUploadTicketDto } from "./dto/create-upload-ticket.dto";
import {
  PublicMediaAssetRecord,
  MediaAssetRecord,
  MediaService,
  UploadTicketRecord
} from "./media.service";

@Controller("media")
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<MediaAssetRecord[]> {
    return this.mediaService.listMine(user.userId);
  }

  @Public()
  @Get("public/:ownerUserId")
  listApprovedForOwner(
    @Param("ownerUserId") ownerUserId: string
  ): Promise<PublicMediaAssetRecord[]> {
    return this.mediaService.listApprovedForOwner(ownerUserId);
  }

  @Post("upload-ticket")
  createUploadTicket(
    @Body() body: CreateUploadTicketDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<UploadTicketRecord> {
    return this.mediaService.createUploadTicket({
      ownerUserId: user.userId,
      kind: body.kind,
      contentType: body.contentType,
      fileSizeBytes: body.fileSizeBytes,
      checksumSha256: body.checksumSha256,
      originalFileName: body.originalFileName,
      jobId: body.jobId
    });
  }

  @Post(":mediaId/complete")
  completeUpload(
    @Param("mediaId") mediaId: string,
    @Body() body: CompleteUploadDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MediaAssetRecord> {
    return this.mediaService.completeUpload({
      mediaId,
      ownerUserId: user.userId,
      etag: body.etag
    });
  }
}
