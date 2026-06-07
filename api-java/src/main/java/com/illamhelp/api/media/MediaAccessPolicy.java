package com.illamhelp.api.media;

import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.common.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class MediaAccessPolicy {
  private final MediaAssetRepository mediaAssetRepository;

  public MediaAccessPolicy(MediaAssetRepository mediaAssetRepository) {
    this.mediaAssetRepository = mediaAssetRepository;
  }

  public void requireCanAttachJobMedia(String userId, String jobId) {
    if (jobId == null || jobId.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Job media requires jobId");
    }
    if (!mediaAssetRepository.canAttachJobMedia(userId, jobId)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "You cannot attach media to this job");
    }
  }

  public void requireCanViewProfileMedia(AuthenticatedUser viewer, String profileUserId) {
    if (profileUserId == null || profileUserId.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "profileUserId is required");
    }
    if (isStaff(viewer) || viewer.userId().equals(profileUserId)
        || mediaAssetRepository.isAcceptedConnection(viewer.userId(), profileUserId)) {
      return;
    }
    throw new ApiException(HttpStatus.FORBIDDEN, "Accepted connection is required to view profile media");
  }

  public void requireCanViewJobMedia(AuthenticatedUser viewer, String jobId) {
    if (jobId == null || jobId.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "jobId is required");
    }
    if (isStaff(viewer) || mediaAssetRepository.canViewJob(viewer.userId(), jobId)) {
      return;
    }
    throw new ApiException(HttpStatus.FORBIDDEN, "You cannot view media for this job");
  }

  public boolean isStaff(AuthenticatedUser user) {
    return user.roles().contains("admin") || user.roles().contains("support");
  }
}
