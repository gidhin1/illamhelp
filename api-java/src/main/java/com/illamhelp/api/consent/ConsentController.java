package com.illamhelp.api.consent;

import com.illamhelp.api.common.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
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
public class ConsentController {
  private final ConsentService service;

  public ConsentController(ConsentService service) {
    this.service = service;
  }

  @GetMapping("/consent/requests")
  public ConsentService.ConsentPage<ConsentService.AccessRequestRecord> requests(
      @AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) String cursor) {
    return service.requests(CurrentUser.fromJwt(jwt).userId(), limit, cursor);
  }

  @GetMapping("/consent/grants")
  public ConsentService.ConsentPage<ConsentService.GrantRecord> grants(
      @AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) String cursor) {
    return service.grants(CurrentUser.fromJwt(jwt).userId(), limit, cursor);
  }

  @PostMapping("/consent/request-access")
  @ResponseStatus(HttpStatus.CREATED)
  public ConsentService.AccessRequestRecord requestAccess(@AuthenticationPrincipal Jwt jwt,
      @Valid @RequestBody RequestAccessRequest request) {
    return service.requestAccess(CurrentUser.fromJwt(jwt).userId(),
        new ConsentService.RequestAccessInput(
            request.ownerUserId(), request.connectionId(), request.requestedFields(), request.purpose()));
  }

  @PostMapping("/consent/{requestId}/grant")
  @ResponseStatus(HttpStatus.CREATED)
  public ConsentService.GrantRecord grant(@AuthenticationPrincipal Jwt jwt, @PathVariable String requestId,
      @Valid @RequestBody GrantAccessRequest request) {
    return service.grant(CurrentUser.fromJwt(jwt).userId(), requestId,
        new ConsentService.GrantAccessInput(request.grantedFields(), request.expiresAt(), request.purpose()));
  }

  @PostMapping("/consent/{grantId}/revoke")
  @ResponseStatus(HttpStatus.CREATED)
  public ConsentService.GrantRecord revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable String grantId,
      @Valid @RequestBody RevokeAccessRequest request) {
    return service.revoke(CurrentUser.fromJwt(jwt).userId(), grantId, new ConsentService.RevokeAccessInput(request.reason()));
  }

  @PostMapping("/consent/can-view")
  @ResponseStatus(HttpStatus.CREATED)
  public ConsentService.CanViewResponse canView(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CanViewRequest request) {
    return service.canView(CurrentUser.fromJwt(jwt).userId(), new ConsentService.CanViewInput(request.ownerUserId(), request.field()));
  }

  public record RequestAccessRequest(
      @NotBlank @Size(min = 3, max = 40) String ownerUserId,
      @NotBlank @Pattern(regexp = "^[0-9a-fA-F-]{36}$") String connectionId,
      @Size(min = 1) List<@Pattern(regexp = "phone|alternate_phone|email|full_address") String> requestedFields,
      @NotBlank @Size(min = 3, max = 200) String purpose) {
  }

  public record GrantAccessRequest(
      @Size(min = 1) List<@Pattern(regexp = "phone|alternate_phone|email|full_address") String> grantedFields,
      String expiresAt,
      @NotBlank @Size(min = 3, max = 200) String purpose) {
  }

  public record RevokeAccessRequest(@NotBlank @Size(min = 3, max = 300) String reason) {
  }

  public record CanViewRequest(
      @NotBlank @Size(min = 3, max = 40) String ownerUserId,
      @NotBlank @Pattern(regexp = "phone|alternate_phone|email|full_address") String field) {
  }
}
