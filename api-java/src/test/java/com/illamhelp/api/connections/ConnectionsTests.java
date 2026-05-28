package com.illamhelp.api.connections;

import static com.illamhelp.api.TestFixtures.jwt;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.common.CursorPages;
import com.illamhelp.api.consent.ConsentService;
import com.illamhelp.api.notifications.NotificationService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ConnectionsTests {
  @Test
  void controllerPassesJwtActorToService() {
    ConnectionsService service = mock(ConnectionsService.class);
    ConnectionsController controller = new ConnectionsController(service);
    controller.request(jwt("actor"), new ConnectionsController.ConnectionRequest("target", null));
    controller.accept(jwt("actor"), "c1");
    controller.search(jwt("actor"), new ConnectionsController.ConnectionSearchRequest("Care", 4));
    Map<String, Object> request = new java.util.LinkedHashMap<>();
    request.put("targetUserId", "target");
    request.put("targetQuery", null);
    verify(service).request("actor", request);
    verify(service).decide("c1", "actor", "accepted");
    verify(service).search("actor", "Care", 4);
  }

  @Test
  void requestsConnectionAndPublicizesInternalUserIds() {
    ConnectionRepository repository = mock(ConnectionRepository.class);
    AuditService audit = mock(AuditService.class);
    NotificationService notifications = mock(NotificationService.class);
    ConnectionsService service = new ConnectionsService(repository, mock(ConsentService.class), audit, notifications);
    when(repository.findInternalUserIdByUsername("provider")).thenReturn("target");
    when(repository.requestConnection("actor", "target")).thenReturn(Map.of(
        "id", "c1", "userAId", "actor", "userBId", "target", "requestedByUserId", "actor"));
    when(repository.findPublicUserId("actor")).thenReturn("member_a");
    when(repository.findPublicUserId("target")).thenReturn("member_b");

    Map<String, Object> response = service.request("actor", Map.of("targetQuery", "provider"));

    assertThat(response).containsEntry("userAId", "member_a").containsEntry("userBId", "member_b");
    verify(audit).logEvent("actor", "target", "connection_requested", null, Map.of("connectionId", "c1"));
    verify(notifications).create("target", "connection_request_received", "Connection request",
        "You received a new connection request.", Map.of("connectionId", "c1"));
  }

  @Test
  void rejectsSelfConnectionAndClampsSearchLimit() {
    ConnectionRepository repository = mock(ConnectionRepository.class);
    ConnectionsService service = new ConnectionsService(repository, mock(ConsentService.class),
        mock(AuditService.class), mock(NotificationService.class));
    when(repository.searchCandidates("actor", "help", "%help%", 20)).thenReturn(List.of());
    service.search("actor", " HELP ", 99);
    verify(repository).searchCandidates("actor", "help", "%help%", 20);
    String actorId = UUID.randomUUID().toString();
    assertThatThrownBy(() -> service.request(actorId, Map.of("targetUserId", actorId)))
        .isInstanceOf(ApiException.class);
  }

  @Test
  void rejectsNonParticipantDecisionsAndRevokesConsentWhenBlocking() {
    ConnectionRepository repository = mock(ConnectionRepository.class);
    ConsentService consent = mock(ConsentService.class);
    AuditService audit = mock(AuditService.class);
    ConnectionsService service = new ConnectionsService(repository, consent, audit, mock(NotificationService.class));
    when(repository.findConnection("c")).thenReturn(Map.of(
        "id", "c", "userAId", "a", "userBId", "b", "requestedByUserId", "a", "status", "accepted"));

    assertThatThrownBy(() -> service.decide("c", "outsider", "blocked"))
        .isInstanceOf(ApiException.class)
        .hasMessage("Actor is not part of this connection");

    when(repository.decideConnection("c", "b", "blocked")).thenReturn(Map.of(
        "id", "c", "userAId", "a", "userBId", "b", "requestedByUserId", "a", "status", "blocked"));
    when(repository.findPublicUserId("a")).thenReturn("member_a");
    when(repository.findPublicUserId("b")).thenReturn("member_b");
    assertThat(service.decide("c", "b", "blocked")).containsEntry("status", "blocked");
    verify(consent).revokeAllForConnection("c", "Connection blocked by participant");
    verify(audit).logEvent("b", "a", "connection_blocked", null, Map.of("connectionId", "c"));
  }

  @Test
  void staleDecisionDoesNotRevokeConsentOrWriteAudit() {
    ConnectionRepository repository = mock(ConnectionRepository.class);
    ConsentService consent = mock(ConsentService.class);
    AuditService audit = mock(AuditService.class);
    ConnectionsService service = new ConnectionsService(repository, consent, audit, mock(NotificationService.class));
    when(repository.findConnection("c")).thenReturn(Map.of(
        "id", "c", "userAId", "a", "userBId", "b", "requestedByUserId", "a", "status", "pending"));
    when(repository.decideConnection("c", "b", "accepted")).thenReturn(Map.of());

    assertThatThrownBy(() -> service.decide("c", "b", "accepted"))
        .isInstanceOf(ApiException.class)
        .hasMessage("Connection state changed before this operation completed");
    verifyNoInteractions(consent, audit);
  }

  @Test
  void concurrentExistingRelationshipIsReturnedWithoutNewRequestSideEffects() {
    ConnectionRepository repository = mock(ConnectionRepository.class);
    AuditService audit = mock(AuditService.class);
    NotificationService notifications = mock(NotificationService.class);
    ConnectionsService service = new ConnectionsService(repository, mock(ConsentService.class), audit, notifications);
    when(repository.findInternalUserIdByUsername("provider")).thenReturn("target");
    when(repository.requestConnection("actor", "target")).thenReturn(Map.of());
    when(repository.findBetween("actor", "target")).thenReturn(Map.of(), Map.of(
        "id", "c1", "userAId", "actor", "userBId", "target",
        "requestedByUserId", "actor", "status", "blocked"));
    when(repository.findPublicUserId("actor")).thenReturn("member_a");
    when(repository.findPublicUserId("target")).thenReturn("member_b");

    assertThat(service.request("actor", Map.of("targetQuery", "provider")))
        .containsEntry("status", "blocked");
    verifyNoInteractions(audit, notifications);
  }

  @Test
  void listUsesProjectedPublicIdentifiersWithoutLookupQueries() {
    ConnectionRepository repository = mock(ConnectionRepository.class);
    when(repository.listForUser("actor", null, null, 11)).thenReturn(List.of(Map.of(
        "id", "c", "userAId", "a", "userBId", "b", "requestedByUserId", "a",
        "requestedAt", "2026-05-26T10:00:00Z", "userAPublicId", "member_a",
        "userBPublicId", "member_b", "requestedByPublicId", "member_a")));
    ConnectionsService service = new ConnectionsService(repository, mock(ConsentService.class),
        mock(AuditService.class), mock(NotificationService.class));

    @SuppressWarnings("unchecked")
    Map<String, Object> item = (Map<String, Object>) ((List<?>) service.list("actor", 10, null).get("items")).getFirst();

    assertThat(item).containsEntry("userAId", "member_a").containsEntry("userBId", "member_b");
    verify(repository, never()).findPublicUserId(org.mockito.ArgumentMatchers.any());
  }

  @Test
  void listPassesDecodedRequestedAtCursorIntoKeysetQuery() {
    ConnectionRepository repository = mock(ConnectionRepository.class);
    String cursor = String.valueOf(CursorPages.response(List.of(
        Map.of("id", "anchor", "requestedAt", "2026-05-26T10:00:00Z"),
        Map.of("id", "older", "requestedAt", "2026-05-26T09:00:00Z")), 1, "requestedAt").get("nextCursor"));
    when(repository.listForUser("actor", "2026-05-26T10:00:00Z", "anchor", 2)).thenReturn(List.of());
    ConnectionsService service = new ConnectionsService(repository, mock(ConsentService.class),
        mock(AuditService.class), mock(NotificationService.class));

    Map<String, Object> page = service.list("actor", 1, cursor);

    assertThat(page).containsEntry("nextCursor", null);
    verify(repository).listForUser("actor", "2026-05-26T10:00:00Z", "anchor", 2);
  }
}
