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
    validatePolicyVersions(request.acceptedTermsVersion(), request.acceptedPrivacyPolicyVersion());
    if (acceptedAt(request) == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "acceptedLegalAt must be a valid ISO timestamp");
    }
    String source = request.acceptanceSource();
    if (!"web".equals(source) && !"mobile".equals(source)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "acceptanceSource must be web or mobile");
    }
  }

  public void validatePolicyVersions(String termsVersion, String privacyVersion) {
    if (!LegalPolicyVersions.TERMS.equals(termsVersion)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Accept the current Terms and Conditions to create an account");
    }
    if (!LegalPolicyVersions.PRIVACY_POLICY.equals(privacyVersion)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Accept the current Privacy Policy to create an account");
    }
  }

  public boolean hasCurrentAcceptance(UUID userId) {
    return repository.existsByUserIdAndDocumentTypeAndVersion(userId, "terms", LegalPolicyVersions.TERMS)
        && repository.existsByUserIdAndDocumentTypeAndVersion(userId, "privacy_policy", LegalPolicyVersions.PRIVACY_POLICY);
  }

  @Transactional
  public void recordMissingAcceptance(UUID userId, String source) {
    Instant acceptedAt = Instant.now();
    recordMissingDocument(userId, "terms", LegalPolicyVersions.TERMS, acceptedAt, source);
    recordMissingDocument(userId, "privacy_policy", LegalPolicyVersions.PRIVACY_POLICY, acceptedAt, source);
  }

  private void recordMissingDocument(UUID userId, String document, String version, Instant acceptedAt, String source) {
    if (repository.existsByUserIdAndDocumentTypeAndVersion(userId, document, version)) {
      return;
    }
    recordDocument(userId, document, version, acceptedAt, source);
  }

  private void recordDocument(UUID userId, String document, String version, Instant acceptedAt, String source) {
    repository.save(new PolicyAcceptanceEntity(userId, document, version, acceptedAt, source, Map.of("source", source)));
    String event = "privacy_policy".equals(document) ? "policy_privacy_accepted" : "policy_terms_accepted";
    auditService.logEvent(userId.toString(), userId.toString(), event, "registration",
        Map.of("version", version, "source", source));
  }

  @Transactional
  public void recordRegistrationAcceptance(String userId, AuthController.RegisterRequest request) {
    Instant acceptedAt = acceptedAt(request);
    if (acceptedAt == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "acceptedLegalAt must be a valid ISO timestamp");
    }
    UUID userUuid = UUID.fromString(userId);
    recordDocument(userUuid, "terms", LegalPolicyVersions.TERMS, acceptedAt, request.acceptanceSource());
    recordDocument(userUuid, "privacy_policy", LegalPolicyVersions.PRIVACY_POLICY, acceptedAt, request.acceptanceSource());
  }

  private Instant acceptedAt(AuthController.RegisterRequest request) {
    try {
      return request.acceptedLegalAt() == null ? null : Instant.parse(request.acceptedLegalAt());
    } catch (DateTimeParseException exception) {
      return null;
    }
  }
}
