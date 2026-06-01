package com.illamhelp.api.consent;

import static com.illamhelp.api.TestFixtures.jwt;
import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;
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
    verify(service).requestAccess("owner", new ConsentService.RequestAccessInput(
        "member", "connection-id", List.of("phone"), "Discuss service"));
    verify(service).grant("owner", "r1", new ConsentService.GrantAccessInput(List.of("phone"), null, "Discuss service"));
    verify(service).revoke("owner", "g1", new ConsentService.RevokeAccessInput("No longer needed"));
  }

  @Test
  void deniesMissingGrantAndAuditsReadAttempt() {
    ConsentRepository repository = mock(ConsentRepository.class);
    AuditService audit = mock(AuditService.class);
    ConsentService service = new ConsentService(repository, mock(OpaService.class), audit, mock(NotificationService.class));
    when(repository.findUserIdByUsername("owner")).thenReturn("owner-id");
    when(repository.activeGrant("owner-id", "viewer", "phone")).thenReturn(List.of());

    assertThat(service.canView("viewer", new ConsentService.CanViewInput("owner", "phone")).allowed()).isFalse();
    verify(audit).logEvent("viewer", "owner-id", "pii_access_checked", "consent_read_path",
        Map.of("field", "phone", "allowed", false, "reason", "no_active_grant"));
  }

  @Test
  void usesOpaForActiveConsentGrant() {
    ConsentRepository repository = mock(ConsentRepository.class);
    OpaService opa = mock(OpaService.class);
    when(repository.activeGrant("10000000-0000-4000-8000-000000000000", "viewer", "phone"))
        .thenReturn(List.of(activeGrant("active", new String[]{"phone"}, null, "accepted")));
    when(opa.canViewPii(any())).thenReturn(true);
    ConsentService service = new ConsentService(repository, opa, mock(AuditService.class), mock(NotificationService.class));

    assertThat(service.canView("viewer", new ConsentService.CanViewInput("10000000-0000-4000-8000-000000000000", "phone")).allowed())
        .isTrue();
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
        revokedGrant("g", "owner", "viewer")));
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
        connectionForConsent("viewer", "owner-id", "pending"));

    assertThatThrownBy(() -> service.requestAccess("viewer", new ConsentService.RequestAccessInput(
        "owner", "connection", List.of("phone"), "Discuss service")))
        .isInstanceOf(ApiException.class)
        .hasMessage("Mutual accepted connection is required before PII access request");
  }

  @Test
  void preventsGrantingFieldsThatWereNotRequested() {
    ConsentRepository repository = mock(ConsentRepository.class);
    ConsentService service = new ConsentService(repository, mock(OpaService.class),
        mock(AuditService.class), mock(NotificationService.class));
    when(repository.findAccessRequest("request")).thenReturn(accessRequestCore(
        "request", "viewer", "owner", "connection", new String[]{"phone"}, "Discuss service", "pending"));

    assertThatThrownBy(() -> service.grant("owner", "request",
        new ConsentService.GrantAccessInput(List.of("email"), null, "Discuss service")))
        .isInstanceOf(ApiException.class)
        .hasMessage("Granted field was not requested: email");
  }

  @Test
  void rejectsInvalidGrantExpiryBeforeUpdatingRequest() {
    ConsentRepository repository = mock(ConsentRepository.class);
    ConsentService service = new ConsentService(repository, mock(OpaService.class),
        mock(AuditService.class), mock(NotificationService.class));
    when(repository.findAccessRequest("request")).thenReturn(accessRequestCore(
        "request", "viewer", "owner", "connection", new String[]{"phone"}, "Discuss service", "pending"));

    assertThatThrownBy(() -> service.grant("owner", "request",
        new ConsentService.GrantAccessInput(List.of("phone"), "tomorrow", null)))
        .isInstanceOf(ApiException.class)
        .hasMessage("expiresAt must be an ISO-8601 timestamp with an offset");
  }

  @Test
  void atomicallyGrantsPendingRequestAndRejectsLostRaceWithoutSideEffects() {
    ConsentRepository repository = mock(ConsentRepository.class);
    AuditService audit = mock(AuditService.class);
    NotificationService notifications = mock(NotificationService.class);
    ConsentService service = new ConsentService(repository, mock(OpaService.class), audit, notifications);
    when(repository.findAccessRequest("request")).thenReturn(accessRequestCore(
        "request", "viewer", "owner", "connection", new String[]{"phone"}, "Discuss service", "pending"));
    when(repository.grantPendingRequest(org.mockito.ArgumentMatchers.eq("request"), org.mockito.ArgumentMatchers.eq("owner"),
        any(String[].class), org.mockito.ArgumentMatchers.eq("Discuss service"), org.mockito.ArgumentMatchers.isNull()))
        .thenReturn(null);

    assertThatThrownBy(() -> service.grant("owner", "request",
        new ConsentService.GrantAccessInput(List.of("phone"), null, "Discuss service")))
        .isInstanceOf(ApiException.class)
        .hasMessage("Access request is no longer pending or an active consent grant already exists.");
    verifyNoInteractions(audit, notifications);
  }

  @Test
  void missingConsentRevokeReturnsNotFoundWithoutSideEffects() {
    ConsentRepository repository = mock(ConsentRepository.class);
    AuditService audit = mock(AuditService.class);
    NotificationService notifications = mock(NotificationService.class);
    ConsentService service = new ConsentService(repository, mock(OpaService.class), audit, notifications);
    when(repository.revokeGrant("missing", "owner", "No longer needed")).thenReturn(null);

    assertThatThrownBy(() -> service.revoke("owner", "missing", new ConsentService.RevokeAccessInput("No longer needed")))
        .isInstanceOf(ApiException.class).hasMessage("Consent grant not found");
    verifyNoInteractions(audit, notifications);
  }

  @Test
  void consentListsAreBoundedAndUseProjectedUsernames() {
    ConsentRepository repository = mock(ConsentRepository.class);
    when(repository.requests("actor", null, null, 51)).thenReturn(List.of(accessRequest(
        "request", "internal-a", "internal-b", "connection", new String[]{"phone"},
        "purpose", "pending", "2026-05-26T10:00:00Z", "member_a", "member_b")));
    ConsentService service = new ConsentService(repository, mock(OpaService.class),
        mock(AuditService.class), mock(NotificationService.class));

    ConsentService.AccessRequestRecord item = service.requests("actor", null, null).items().getFirst();
    assertThat(item.requesterUserId()).isEqualTo("member_a");
    assertThat(item.ownerUserId()).isEqualTo("member_b");
    verify(repository, never()).findUsername(org.mockito.ArgumentMatchers.any());
  }

  private static ConsentRepository.ConnectionForConsentRow connectionForConsent(String userAId, String userBId, String status) {
    return new ConsentRepository.ConnectionForConsentRow() {
      @Override public String getUserAId() { return userAId; }
      @Override public String getUserBId() { return userBId; }
      @Override public String getStatus() { return status; }
    };
  }

  private static ConsentRepository.AccessRequestCoreRow accessRequestCore(
      String id, String requesterUserId, String ownerUserId, String connectionId,
      Object requestedFields, String purpose, String status) {
    return new ConsentRepository.AccessRequestCoreRow() {
      @Override public String getId() { return id; }
      @Override public String getRequesterUserId() { return requesterUserId; }
      @Override public String getOwnerUserId() { return ownerUserId; }
      @Override public String getConnectionId() { return connectionId; }
      @Override public Object getRequestedFields() { return requestedFields; }
      @Override public String getPurpose() { return purpose; }
      @Override public String getStatus() { return status; }
    };
  }

  private static ConsentRepository.AccessRequestRow accessRequest(
      String id, String requesterUserId, String ownerUserId, String connectionId, Object requestedFields,
      String purpose, String status, String createdAt, String requesterPublicUserId, String ownerPublicUserId) {
    return new ConsentRepository.AccessRequestRow() {
      @Override public String getId() { return id; }
      @Override public String getRequesterUserId() { return requesterUserId; }
      @Override public String getOwnerUserId() { return ownerUserId; }
      @Override public String getConnectionId() { return connectionId; }
      @Override public Object getRequestedFields() { return requestedFields; }
      @Override public String getPurpose() { return purpose; }
      @Override public String getStatus() { return status; }
      @Override public String getCreatedAt() { return createdAt; }
      @Override public String getRequesterPublicUserId() { return requesterPublicUserId; }
      @Override public String getOwnerPublicUserId() { return ownerPublicUserId; }
    };
  }

  private static ConsentRepository.RevokedGrantRow revokedGrant(String id, String ownerUserId, String granteeUserId) {
    return new ConsentRepository.RevokedGrantRow() {
      @Override public String getId() { return id; }
      @Override public String getOwnerUserId() { return ownerUserId; }
      @Override public String getGranteeUserId() { return granteeUserId; }
    };
  }

  private static ConsentRepository.ActiveGrantRow activeGrant(
      String grantStatus, Object grantedFields, String expiresAt, String relationshipStatus) {
    return new ConsentRepository.ActiveGrantRow() {
      @Override public String getGrantStatus() { return grantStatus; }
      @Override public Object getGrantedFields() { return grantedFields; }
      @Override public String getExpiresAt() { return expiresAt; }
      @Override public String getRelationshipStatus() { return relationshipStatus; }
    };
  }
}
