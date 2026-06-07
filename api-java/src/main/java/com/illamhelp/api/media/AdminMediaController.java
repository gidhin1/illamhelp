package com.illamhelp.api.media;

import com.illamhelp.api.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@PreAuthorize("hasAnyRole('admin','support')")
public class AdminMediaController {
  @GetMapping({"/admin/media/moderation-queue", "/admin/media/{mediaId}/moderation"})
  public void blockedList(@PathVariable(required = false) String mediaId) {
    throw gone();
  }

  @PostMapping({"/admin/media/moderation/process", "/admin/media/{mediaId}/review"})
  public void blockedMutation(@PathVariable(required = false) String mediaId) {
    throw gone();
  }

  private ApiException gone() {
    return new ApiException(HttpStatus.GONE, "Admin media REST APIs have moved to gRPC");
  }
}
