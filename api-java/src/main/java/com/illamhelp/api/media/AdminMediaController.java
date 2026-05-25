package com.illamhelp.api.media;

import com.illamhelp.api.common.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@PreAuthorize("hasAnyRole('admin','support')")
public class AdminMediaController {
  private final MediaModerationService moderationService;

  public AdminMediaController(MediaModerationService moderationService) {
    this.moderationService = moderationService;
  }

  @GetMapping("/admin/media/moderation-queue")
  public List<Map<String, Object>> queue(@Valid @ModelAttribute ModerationQueueRequest request) {
    return moderationService.listModerationQueue(request.stage(), request.status(),
        request.limit() == null ? 50 : request.limit());
  }

  @GetMapping("/admin/media/{mediaId}/moderation")
  public Map<String, Object> details(@PathVariable String mediaId) {
    return moderationService.getModerationDetails(mediaId);
  }

  @PostMapping("/admin/media/moderation/process")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Integer> process(@AuthenticationPrincipal Jwt jwt,
      @Valid @RequestBody(required = false) ProcessModerationRequest request) {
    Map<String, Object> body = request == null || request.limit() == null ? null : Map.of("limit", request.limit());
    return moderationService.processPendingJobs(CurrentUser.fromJwt(jwt).userId(), body);
  }

  @PostMapping("/admin/media/{mediaId}/review")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> review(@AuthenticationPrincipal Jwt jwt, @PathVariable String mediaId,
      @Valid @RequestBody ReviewMediaRequest request) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("decision", request.decision());
    body.put("reasonCode", request.reasonCode());
    body.put("notes", request.notes());
    return moderationService.reviewMedia(CurrentUser.fromJwt(jwt).userId(), mediaId, body);
  }

  public record ModerationQueueRequest(
      @Pattern(regexp = "technical_validation|ai_review|human_review") String stage,
      @Pattern(regexp = "pending|running|approved|rejected|error") String status,
      @Min(1) Integer limit) {
  }

  public record ProcessModerationRequest(@Min(1) Integer limit) {
  }

  public record ReviewMediaRequest(
      @NotBlank @Pattern(regexp = "approved|rejected") String decision,
      @Pattern(regexp = "^[a-zA-Z0-9_:-]{2,80}$") String reasonCode,
      @Size(max = 1000) String notes) {
  }
}
