package com.illamhelp.api.media;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.common.AuthenticatedUser;
import com.illamhelp.api.proto.media.v1.GetModerationDetailsRequest;
import com.illamhelp.api.proto.media.v1.ListModerationQueueRequest;
import com.illamhelp.api.proto.media.v1.ModerationDetails;
import com.illamhelp.api.proto.media.v1.ModerationJob;
import com.illamhelp.api.proto.media.v1.ModerationMedia;
import com.illamhelp.api.proto.media.v1.ModerationQueueItem;
import com.illamhelp.api.proto.media.v1.ModerationQueuePage;
import com.illamhelp.api.proto.media.v1.ProcessModerationJobsRequest;
import com.illamhelp.api.proto.media.v1.ProcessModerationJobsResponse;
import com.illamhelp.api.proto.media.v1.ReviewMediaRequest;
import io.grpc.stub.StreamObserver;
import org.springframework.stereotype.Service;

@Service
public class GrpcAdminMediaService extends com.illamhelp.api.proto.media.v1.AdminMediaServiceGrpc.AdminMediaServiceImplBase {
  private final MediaModerationService moderationService;
  private final ObjectMapper objectMapper;

  public GrpcAdminMediaService(MediaModerationService moderationService, ObjectMapper objectMapper) {
    this.moderationService = moderationService;
    this.objectMapper = objectMapper;
  }

  @Override
  public void listModerationQueue(ListModerationQueueRequest request, StreamObserver<ModerationQueuePage> responseObserver) {
    try {
      GrpcAuth.requireStaff(GrpcAuth.currentUser());
      responseObserver.onNext(ModerationQueuePage.newBuilder()
          .addAllItems(moderationService.listModerationQueue(blankToNull(request.getStage()), blankToNull(request.getStatus()),
              request.getLimit() == 0 ? 50 : request.getLimit()).stream().map(this::queueItem).toList())
          .build());
      responseObserver.onCompleted();
    } catch (Throwable throwable) {
      responseObserver.onError(GrpcMediaMappers.status(throwable));
    }
  }

  @Override
  public void getModerationDetails(GetModerationDetailsRequest request, StreamObserver<ModerationDetails> responseObserver) {
    try {
      GrpcAuth.requireStaff(GrpcAuth.currentUser());
      MediaModerationService.ModerationDetails details = moderationService.getModerationDetails(request.getMediaId());
      responseObserver.onNext(ModerationDetails.newBuilder()
          .setMedia(moderationMedia(details.media()))
          .addAllModerationJobs(details.moderationJobs().stream().map(this::moderationJob).toList())
          .build());
      responseObserver.onCompleted();
    } catch (Throwable throwable) {
      responseObserver.onError(GrpcMediaMappers.status(throwable));
    }
  }

  @Override
  public void processModerationJobs(ProcessModerationJobsRequest request, StreamObserver<ProcessModerationJobsResponse> responseObserver) {
    try {
      AuthenticatedUser user = GrpcAuth.currentUser();
      GrpcAuth.requireStaff(user);
      MediaModerationService.ProcessModerationResult result = moderationService.processPendingJobs(user.userId(),
          new MediaModerationService.ProcessModerationInput(request.getLimit() == 0 ? null : request.getLimit()));
      responseObserver.onNext(ProcessModerationJobsResponse.newBuilder()
          .setSelected(result.selected())
          .setProcessed(result.processed())
          .setTechnicalApproved(result.technicalApproved())
          .setTechnicalRejected(result.technicalRejected())
          .setAiCompleted(result.aiCompleted())
          .setErrors(result.errors())
          .build());
      responseObserver.onCompleted();
    } catch (Throwable throwable) {
      responseObserver.onError(GrpcMediaMappers.status(throwable));
    }
  }

  @Override
  public void reviewMedia(ReviewMediaRequest request, StreamObserver<com.illamhelp.api.proto.media.v1.MediaAsset> responseObserver) {
    try {
      AuthenticatedUser user = GrpcAuth.currentUser();
      GrpcAuth.requireStaff(user);
      responseObserver.onNext(GrpcMediaMappers.mediaAsset(moderationService.reviewMedia(user.userId(), request.getMediaId(),
          new MediaModerationService.ReviewMediaInput(request.getDecision(), blankToNull(request.getReasonCode()),
              blankToNull(request.getNotes())))));
      responseObserver.onCompleted();
    } catch (Throwable throwable) {
      responseObserver.onError(GrpcMediaMappers.status(throwable));
    }
  }

  private ModerationQueueItem queueItem(MediaModerationService.ModerationQueueItem item) {
    return ModerationQueueItem.newBuilder()
        .setModerationJobId(GrpcMediaMappers.value(item.moderationJobId()))
        .setMediaId(GrpcMediaMappers.value(item.mediaId()))
        .setStage(GrpcMediaMappers.value(item.stage()))
        .setStatus(GrpcMediaMappers.value(item.status()))
        .setReasonCode(GrpcMediaMappers.value(item.reasonCode()))
        .setModerationCreatedAt(GrpcMediaMappers.value(item.moderationCreatedAt()))
        .setMediaState(GrpcMediaMappers.state(item.mediaState()))
        .setOwnerUserId(GrpcMediaMappers.value(item.ownerUserId()))
        .setKind(GrpcMediaMappers.kind(item.kind()))
        .setPurpose(GrpcMediaMappers.purpose(item.purpose()))
        .setContentType(GrpcMediaMappers.value(item.contentType()))
        .setFileSizeBytes(item.fileSizeBytes() == null ? 0 : item.fileSizeBytes())
        .build();
  }

  private ModerationMedia moderationMedia(MediaModerationService.ModerationMedia media) {
    return ModerationMedia.newBuilder()
        .setId(GrpcMediaMappers.value(media.id()))
        .setOwnerUserId(GrpcMediaMappers.value(media.ownerUserId()))
        .setProfileUserId(GrpcMediaMappers.value(media.profileUserId()))
        .setJobId(GrpcMediaMappers.value(media.jobId()))
        .setKind(GrpcMediaMappers.kind(media.kind()))
        .setPurpose(GrpcMediaMappers.purpose(media.purpose()))
        .setBucketName(GrpcMediaMappers.value(media.bucketName()))
        .setObjectKey(GrpcMediaMappers.value(media.objectKey()))
        .setContentType(GrpcMediaMappers.value(media.contentType()))
        .setFileSizeBytes(media.fileSizeBytes() == null ? 0 : media.fileSizeBytes())
        .setChecksumSha256(GrpcMediaMappers.value(media.checksumSha256()))
        .setState(GrpcMediaMappers.state(media.state()))
        .addAllModerationReasonCodes(GrpcMediaMappers.strings(media.moderationReasonCodes()))
        .setAiScoresJson(GrpcMediaMappers.json(objectMapper, media.aiScores()))
        .setCreatedAt(GrpcMediaMappers.value(media.createdAt()))
        .setUpdatedAt(GrpcMediaMappers.value(media.updatedAt()))
        .setPreviewUrl(GrpcMediaMappers.value(media.previewUrl()))
        .setPreviewUrlExpiresAt(GrpcMediaMappers.value(media.previewUrlExpiresAt()))
        .build();
  }

  private ModerationJob moderationJob(MediaModerationService.ModerationJob job) {
    return ModerationJob.newBuilder()
        .setId(GrpcMediaMappers.value(job.id()))
        .setMediaAssetId(GrpcMediaMappers.value(job.mediaAssetId()))
        .setStage(GrpcMediaMappers.value(job.stage()))
        .setStatus(GrpcMediaMappers.value(job.status()))
        .setAssignedModeratorUserId(GrpcMediaMappers.value(job.assignedModeratorUserId()))
        .setReasonCode(GrpcMediaMappers.value(job.reasonCode()))
        .setDetailsJson(GrpcMediaMappers.json(objectMapper, job.details()))
        .setCreatedAt(GrpcMediaMappers.value(job.createdAt()))
        .setCompletedAt(GrpcMediaMappers.value(job.completedAt()))
        .build();
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
