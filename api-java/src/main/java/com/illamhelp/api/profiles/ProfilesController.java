package com.illamhelp.api.profiles;

import com.illamhelp.api.common.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ResponseStatus;
import tools.jackson.databind.node.NullNode;

@RestController
public class ProfilesController {
  private final ProfilesService profilesService;
  private final VerificationService verificationService;

  public ProfilesController(ProfilesService profilesService, VerificationService verificationService) {
    this.profilesService = profilesService;
    this.verificationService = verificationService;
  }

  @GetMapping("/profiles/me")
  public Map<String, Object> me(@AuthenticationPrincipal Jwt jwt) {
    return profilesService.getOwnProfile(CurrentUser.fromJwt(jwt).userId());
  }

  @GetMapping("/profiles/me/dashboard")
  public Map<String, Object> dashboard(@AuthenticationPrincipal Jwt jwt) {
    return profilesService.dashboard(CurrentUser.fromJwt(jwt).userId());
  }

  @PatchMapping("/profiles/me")
  public Map<String, Object> updateMe(
      @Valid @RequestBody ProfilesService.UpdateProfileRequest request,
      @AuthenticationPrincipal Jwt jwt) {
    return profilesService.updateOwnProfile(CurrentUser.fromJwt(jwt).userId(), request);
  }

  @PostMapping("/profiles/me/verification")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> submitVerification(@Valid @RequestBody SubmitVerificationRequest request,
      @AuthenticationPrincipal Jwt jwt) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("documentType", request.documentType());
    body.put("documentMediaIds", request.documentMediaIds());
    body.put("notes", request.notes());
    return verificationService.submit(CurrentUser.fromJwt(jwt).userId(), body);
  }

  @GetMapping("/profiles/me/verification")
  public Object myVerification(@AuthenticationPrincipal Jwt jwt) {
    Map<String, Object> verification =
        verificationService.getMyVerification(CurrentUser.fromJwt(jwt).userId());
    return verification == null ? NullNode.getInstance() : verification;
  }

  @GetMapping("/profiles/{userId}")
  public Map<String, Object> byId(@PathVariable String userId, @AuthenticationPrincipal Jwt jwt) {
    return profilesService.getProfileForViewer(userId, CurrentUser.fromJwt(jwt).userId());
  }

  public record SubmitVerificationRequest(
      @NotBlank @Size(max = 50) String documentType,
      @Size(min = 1) List<@NotBlank String> documentMediaIds,
      @Size(max = 500) String notes) {
  }
}
