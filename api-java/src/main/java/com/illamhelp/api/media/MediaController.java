package com.illamhelp.api.media;

import com.illamhelp.api.common.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;

@RestController
public class MediaController {
  private final MediaService service;

  public MediaController(MediaService service) {
    this.service = service;
  }

  @GetMapping("/media")
  public Map<String, Object> mine(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) String cursor) {
    return service.listMine(CurrentUser.fromJwt(jwt).userId(), limit, cursor);
  }

  @GetMapping("/media/public/{ownerUserId}")
  public Map<String, Object> publicMedia(@PathVariable String ownerUserId, @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) String cursor) {
    return service.listApprovedForOwner(ownerUserId, limit, cursor);
  }

  @PostMapping("/media/upload-ticket")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> uploadTicket(@AuthenticationPrincipal Jwt jwt,
      @Valid @RequestBody UploadTicketRequest request) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("kind", request.kind());
    body.put("contentType", request.contentType());
    body.put("fileSizeBytes", request.fileSizeBytes());
    body.put("checksumSha256", request.checksumSha256());
    body.put("originalFileName", request.originalFileName());
    body.put("jobId", request.jobId());
    return service.uploadTicket(CurrentUser.fromJwt(jwt).userId(), body);
  }

  @PostMapping("/media/{mediaId}/complete")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> complete(@AuthenticationPrincipal Jwt jwt, @PathVariable String mediaId,
      @Valid @RequestBody(required = false) CompleteUploadRequest request) {
    return service.complete(CurrentUser.fromJwt(jwt).userId(), mediaId, request == null ? null : request.etag());
  }

  public record UploadTicketRequest(
      @NotBlank @Pattern(regexp = "image|video") String kind,
      @NotBlank @Pattern(regexp = "^[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+$") String contentType,
      @Min(1) @Max(1073741824) long fileSizeBytes,
      @NotBlank @Pattern(regexp = "^[a-fA-F0-9]{64}$") String checksumSha256,
      @NotBlank @Pattern(regexp = "^[^/\\\\]+$") String originalFileName,
      String jobId) {
  }

  public record CompleteUploadRequest(@Pattern(regexp = "^[a-fA-F0-9]{32}$") String etag) {
  }
}
