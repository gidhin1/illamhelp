package com.illamhelp.api.auth;

import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PolicyAcceptanceService {
  private final PolicyAcceptanceRepository repository;
  private final AuditService auditService;

  public PolicyAcceptanceService(PolicyAcceptanceRepository repository, AuditService auditService) {
    this.repository = repository;
    this.auditService = auditService;
  }

  public void validateRegistrationAcceptance(AuthController.RegisterRequest request) {
    if (!LegalPolicyVersions.TERMS.equals(request.acceptedTermsVersion())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Accept the current Terms and Conditions to create an account");
    }
    if (!LegalPolicyVersions.PRIVACY_POLICY.equals(request.acceptedPrivacyPolicyVersion())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Accept the current Privacy Policy to create an account");
    }
    if (acceptedAt(request) == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "acceptedLegalAt must be a valid ISO timestamp");
    }
    String source = request.acceptanceSource();
    if (!"web".equals(source) && !"mobile".equals(source)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "acceptanceSource must be web or mobile");
    }
  }

  @Transactional
  public void recordRegistrationAcceptance(String userId, AuthController.RegisterRequest request) {
    Instant acceptedAt = acceptedAt(request);
    if (acceptedAt == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "acceptedLegalAt must be a valid ISO timestamp");
    }
    UUID userUuid = UUID.fromString(userId);
    Map<String, Object> metadata = Map.of("source", request.acceptanceSource());
    repository.save(new PolicyAcceptanceEntity(
        userUuid, "terms", LegalPolicyVersions.TERMS, acceptedAt, request.acceptanceSource(), metadata));
    repository.save(new PolicyAcceptanceEntity(
        userUuid, "privacy_policy", LegalPolicyVersions.PRIVACY_POLICY, acceptedAt, request.acceptanceSource(), metadata));
    auditService.logEvent(userId, userId, "policy_terms_accepted", "registration",
        Map.of("version", LegalPolicyVersions.TERMS, "source", request.acceptanceSource()));
    auditService.logEvent(userId, userId, "policy_privacy_accepted", "registration",
        Map.of("version", LegalPolicyVersions.PRIVACY_POLICY, "source", request.acceptanceSource()));
  }

  private Instant acceptedAt(AuthController.RegisterRequest request) {
    try {
      return request.acceptedLegalAt() == null ? null : Instant.parse(request.acceptedLegalAt());
    } catch (DateTimeParseException exception) {
      return null;
    }
  }
}
