package com.illamhelp.api.media;

import com.illamhelp.api.common.AuthenticatedUser;
import com.illamhelp.api.proto.media.v1.CompleteUploadRequest;
import com.illamhelp.api.proto.media.v1.CreateUploadTicketRequest;
import com.illamhelp.api.proto.media.v1.DownloadableMediaPage;
import com.illamhelp.api.proto.media.v1.ListJobMediaRequest;
import com.illamhelp.api.proto.media.v1.ListMyMediaRequest;
import com.illamhelp.api.proto.media.v1.ListProfileMediaRequest;
import com.illamhelp.api.proto.media.v1.ListVerificationDocumentsRequest;
import com.illamhelp.api.proto.media.v1.MediaPage;
import com.illamhelp.api.proto.media.v1.UploadTicket;
import io.grpc.stub.StreamObserver;
import org.springframework.stereotype.Service;

@Service
public class GrpcMediaService extends com.illamhelp.api.proto.media.v1.MediaServiceGrpc.MediaServiceImplBase {
  private final MediaService mediaService;

  public GrpcMediaService(MediaService mediaService) {
    this.mediaService = mediaService;
  }

  @Override
  public void createUploadTicket(CreateUploadTicketRequest request, StreamObserver<UploadTicket> responseObserver) {
    try {
      AuthenticatedUser user = GrpcAuth.currentUser();
      MediaService.UploadTicketResponse ticket = mediaService.uploadTicket(user.userId(),
          new MediaService.UploadTicketInput(
              GrpcMediaMappers.kind(request.getKind()),
              request.getContentType(),
              request.getFileSizeBytes(),
              request.getChecksumSha256(),
              request.getOriginalFileName(),
              request.getJobId().isBlank() ? null : request.getJobId(),
              GrpcMediaMappers.purpose(request.getPurpose())));
      responseObserver.onNext(UploadTicket.newBuilder()
          .setUploadUrl(GrpcMediaMappers.value(ticket.uploadUrl()))
          .setExpiresAt(GrpcMediaMappers.value(ticket.expiresAt()))
          .putAllRequiredHeaders(ticket.requiredHeaders())
          .setMediaId(GrpcMediaMappers.value(ticket.mediaId()))
          .setBucketName(GrpcMediaMappers.value(ticket.bucketName()))
          .setObjectKey(GrpcMediaMappers.value(ticket.objectKey()))
          .build());
      responseObserver.onCompleted();
    } catch (Throwable throwable) {
      responseObserver.onError(GrpcMediaMappers.status(throwable));
    }
  }

  @Override
  public void completeUpload(CompleteUploadRequest request, StreamObserver<com.illamhelp.api.proto.media.v1.MediaAsset> responseObserver) {
    try {
      AuthenticatedUser user = GrpcAuth.currentUser();
      responseObserver.onNext(GrpcMediaMappers.mediaAsset(
          mediaService.complete(user.userId(), request.getMediaId(), request.getEtag())));
      responseObserver.onCompleted();
    } catch (Throwable throwable) {
      responseObserver.onError(GrpcMediaMappers.status(throwable));
    }
  }

  @Override
  public void listMyMedia(ListMyMediaRequest request, StreamObserver<MediaPage> responseObserver) {
    try {
      AuthenticatedUser user = GrpcAuth.currentUser();
      MediaService.MediaPage<MediaService.MediaAssetRecord> page =
          mediaService.listMine(user.userId(), request.getLimit() == 0 ? null : request.getLimit(), request.getCursor());
      responseObserver.onNext(MediaPage.newBuilder()
          .addAllItems(page.items().stream().map(GrpcMediaMappers::mediaAsset).toList())
          .setLimit(page.limit())
          .setNextCursor(GrpcMediaMappers.value(page.nextCursor()))
          .build());
      responseObserver.onCompleted();
    } catch (Throwable throwable) {
      responseObserver.onError(GrpcMediaMappers.status(throwable));
    }
  }

  @Override
  public void listProfileMedia(ListProfileMediaRequest request, StreamObserver<DownloadableMediaPage> responseObserver) {
    try {
      AuthenticatedUser user = GrpcAuth.currentUser();
      MediaService.MediaPage<MediaService.PublicMediaRecord> page =
          mediaService.listProfileMedia(user, request.getProfileUserId(), request.getLimit() == 0 ? null : request.getLimit(),
              request.getCursor());
      responseObserver.onNext(downloadablePage(page));
      responseObserver.onCompleted();
    } catch (Throwable throwable) {
      responseObserver.onError(GrpcMediaMappers.status(throwable));
    }
  }

  @Override
  public void listJobMedia(ListJobMediaRequest request, StreamObserver<DownloadableMediaPage> responseObserver) {
    try {
      AuthenticatedUser user = GrpcAuth.currentUser();
      MediaService.MediaPage<MediaService.PublicMediaRecord> page =
          mediaService.listJobMedia(user, request.getJobId(), request.getLimit() == 0 ? null : request.getLimit(),
              request.getCursor());
      responseObserver.onNext(downloadablePage(page));
      responseObserver.onCompleted();
    } catch (Throwable throwable) {
      responseObserver.onError(GrpcMediaMappers.status(throwable));
    }
  }

  @Override
  public void listVerificationDocuments(ListVerificationDocumentsRequest request, StreamObserver<MediaPage> responseObserver) {
    try {
      AuthenticatedUser user = GrpcAuth.currentUser();
      MediaService.MediaPage<MediaService.MediaAssetRecord> page =
          mediaService.listVerificationDocuments(user.userId(), request.getLimit() == 0 ? null : request.getLimit(),
              request.getCursor());
      responseObserver.onNext(MediaPage.newBuilder()
          .addAllItems(page.items().stream().map(GrpcMediaMappers::mediaAsset).toList())
          .setLimit(page.limit())
          .setNextCursor(GrpcMediaMappers.value(page.nextCursor()))
          .build());
      responseObserver.onCompleted();
    } catch (Throwable throwable) {
      responseObserver.onError(GrpcMediaMappers.status(throwable));
    }
  }

  private DownloadableMediaPage downloadablePage(MediaService.MediaPage<MediaService.PublicMediaRecord> page) {
    return DownloadableMediaPage.newBuilder()
        .addAllItems(page.items().stream().map(GrpcMediaMappers::downloadableMedia).toList())
        .setLimit(page.limit())
        .setNextCursor(GrpcMediaMappers.value(page.nextCursor()))
        .build();
  }
}
