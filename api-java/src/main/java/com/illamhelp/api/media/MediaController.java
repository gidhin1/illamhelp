package com.illamhelp.api.media;

import com.illamhelp.api.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MediaController {
  @GetMapping({"/media", "/media/public/{ownerUserId}"})
  public void blockedList(@PathVariable(required = false) String ownerUserId) {
    throw gone();
  }

  @PostMapping({"/media/upload-ticket", "/media/{mediaId}/complete"})
  public void blockedMutation(@PathVariable(required = false) String mediaId) {
    throw gone();
  }

  private ApiException gone() {
    return new ApiException(HttpStatus.GONE, "Media REST APIs have moved to gRPC");
  }
}
