package com.illamhelp.api.consent;

import static com.illamhelp.api.TestFixtures.jwt;
import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.notifications.NotificationService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class ConsentTests {
  @Test
  void controllerDelegatesActorAndBody() {
    ConsentService service = mock(ConsentService.class);
    ConsentController controller = new ConsentController(service);
    controller.requestAccess(jwt("owner"), new ConsentController.RequestAccessRequest(
        "member", "connection-id", List.of("phone"), "Discuss service"));
    controller.grant(jwt("owner"), "r1", new ConsentController.GrantAccessRequest(
        List.of("phone"), null, "Discuss service"));
    controller.revoke(jwt("owner"), "g1", new ConsentController.RevokeAccessRequest("No longer needed"));
    verify(service).requestAccess("owner", Map.of(
        "ownerUserId", "member", "connectionId", "connection-id",
        "requestedFields", List.of("phone"), "purpose", "Discuss service"));
    Map<String, Object> grant = new java.util.LinkedHashMap<>();
    grant.put("grantedFields", List.of("phone"));
    grant.put("expiresAt", null);
    grant.put("purpose", "Discuss service");
    verify(service).grant("owner", "r1", grant);
    verify(service).revoke("owner", "g1", Map.of("reason", "No longer needed"));
  }

  @Test
  void deniesMissingGrantAndAuditsReadAttempt() {
    ConsentRepository repository = mock(ConsentRepository.class);
    AuditService audit = mock(AuditService.class);
    ConsentService service = new ConsentService(repository, mock(OpaService.class), audit, mock(NotificationService.class));
    when(repository.findUserIdByUsername("owner")).thenReturn("owner-id");
    when(repository.activeGrant("owner-id", "viewer", "phone")).thenReturn(List.of());

    assertThat(service.canView("viewer", Map.of("ownerUserId", "owner", "field", "phone"))).containsEntry("allowed", false);
    verify(audit).logEvent("viewer", "owner-id", "pii_access_checked", "consent_read_path",
        Map.of("field", "phone", "allowed", false, "reason", "no_active_grant"));
  }

  @Test
  void usesOpaForActiveConsentGrant() {
    ConsentRepository repository = mock(ConsentRepository.class);
    OpaService opa = mock(OpaService.class);
    when(repository.activeGrant("10000000-0000-4000-8000-000000000000", "viewer", "phone"))
        .thenReturn(List.of(Map.of("grant_status", "active", "granted_fields", new String[]{"phone"}, "relationship_status", "accepted")));
    when(opa.canViewPii(any())).thenReturn(true);
    ConsentService service = new ConsentService(repository, opa, mock(AuditService.class), mock(NotificationService.class));

    assertThat(service.canView("viewer", Map.of("ownerUserId", "10000000-0000-4000-8000-000000000000", "field", "phone")))
        .containsEntry("allowed", true);
    verify(opa).canViewPii(any());
  }

  @Test
  void opaFailsClosedWhenPolicyRequestCannotComplete() {
    RestClient.Builder builder = mock(RestClient.Builder.class);
    when(builder.build()).thenReturn(mock(RestClient.class));
    assertThat(new OpaService(properties(), builder).canViewPii(Map.of("field", "phone"))).isFalse();
  }

  @Test
  void connectionBlockRevokesAndAuditsEveryActiveGrant() {
    ConsentRepository repository = mock(ConsentRepository.class);
    AuditService audit = mock(AuditService.class);
    when(repository.revokeActiveForConnection("c", "blocked")).thenReturn(List.of(
        Map.of("id", "g", "ownerUserId", "owner", "granteeUserId", "viewer")));
    ConsentService service = new ConsentService(repository, mock(OpaService.class), audit, mock(NotificationService.class));

    assertThat(service.revokeAllForConnection("c", "blocked")).isEqualTo(1);
    verify(audit).logEvent("owner", "viewer", "pii_access_revoked", "connection_blocked",
        Map.of("grantId", "g", "connectionId", "c", "reason", "blocked"));
  }

  @Test
  void requiresAcceptedParticipantConnectionBeforeRequestingPii() {
    ConsentRepository repository = mock(ConsentRepository.class);
    ConsentService service = new ConsentService(repository, mock(OpaService.class),
        mock(AuditService.class), mock(NotificationService.class));
    when(repository.findUserIdByUsername("owner")).thenReturn("owner-id");
    when(repository.connectionForConsent("connection")).thenReturn(
        Map.of("status", "pending", "userAId", "viewer", "userBId", "owner-id"));

    assertThatThrownBy(() -> service.requestAccess("viewer", Map.of(
        "ownerUserId", "owner", "connectionId", "connection",
        "requestedFields", List.of("phone"), "purpose", "Discuss service")))
        .isInstanceOf(ApiException.class)
        .hasMessage("Mutual accepted connection is required before PII access request");
  }

  @Test
  void preventsGrantingFieldsThatWereNotRequested() {
    ConsentRepository repository = mock(ConsentRepository.class);
    ConsentService service = new ConsentService(repository, mock(OpaService.class),
        mock(AuditService.class), mock(NotificationService.class));
    when(repository.findAccessRequest("request")).thenReturn(Map.of(
        "ownerUserId", "owner", "requesterUserId", "viewer", "connectionId", "connection",
        "requestedFields", new String[]{"phone"}, "purpose", "Discuss service", "status", "pending"));

    assertThatThrownBy(() -> service.grant("owner", "request", Map.of(
        "grantedFields", List.of("email"), "purpose", "Discuss service")))
        .isInstanceOf(ApiException.class)
        .hasMessage("Granted field was not requested: email");
  }

  @Test
  void rejectsInvalidGrantExpiryBeforeUpdatingRequest() {
    ConsentRepository repository = mock(ConsentRepository.class);
    ConsentService service = new ConsentService(repository, mock(OpaService.class),
        mock(AuditService.class), mock(NotificationService.class));
    when(repository.findAccessRequest("request")).thenReturn(Map.of(
        "ownerUserId", "owner", "requesterUserId", "viewer", "connectionId", "connection",
        "requestedFields", new String[]{"phone"}, "purpose", "Discuss service", "status", "pending"));

    assertThatThrownBy(() -> service.grant("owner", "request", Map.of(
        "grantedFields", List.of("phone"), "expiresAt", "tomorrow")))
        .isInstanceOf(ApiException.class)
        .hasMessage("expiresAt must be an ISO-8601 timestamp with an offset");
  }
}
