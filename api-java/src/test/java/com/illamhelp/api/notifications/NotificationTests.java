package com.illamhelp.api.notifications;

import static com.illamhelp.api.TestFixtures.jwt;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.common.CursorPages;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class NotificationTests {
  @Test
  void controllerUsesAuthenticatedUserForNotificationOperations() {
    NotificationService service = mock(NotificationService.class);
    NotificationController controller = new NotificationController(service);
    controller.list(jwt("u1"), true, 3, "cursor");
    controller.unreadCount(jwt("u1"));
    controller.markRead(jwt("u1"), "n1");
    controller.markAllRead(jwt("u1"));
    verify(service).list("u1", true, 3, "cursor");
    verify(service).unreadCount("u1");
    verify(service).markRead("u1", "n1");
    verify(service).markAllRead("u1");
  }

  @Test
  void normalizesJsonDataAndPaginatesRepositoryResult() {
    NotificationRepository repository = mock(NotificationRepository.class);
    when(repository.listForUser("u1", true, null, null, 101))
        .thenReturn(List.of(Map.of("id", "n", "createdAt", "2026-05-26T10:00:00Z",
            "data", "{\"verificationRequestId\":\"r1\"}", "type", "verification_approved")));
    when(repository.countUnread("u1")).thenReturn(1);
    NotificationService service = new NotificationService(repository, new ObjectMapper());

    Map<String, Object> response = service.list("u1", true, 999, null);
    Map<?, ?> item = (Map<?, ?>) ((List<?>) response.get("items")).getFirst();

    assertThat(response).containsEntry("unreadCount", 1).containsEntry("limit", 100);
    assertThat(((Map<?, ?>) item.get("data")).get("verificationRequestId")).isEqualTo("r1");
  }

  @Test
  void serializesCreationDataAndNormalizesReadPayload() {
    NotificationRepository repository = mock(NotificationRepository.class);
    when(repository.insert("u", "type", "title", "body", "{\"id\":\"1\"}")).thenReturn(Map.of("data", "{\"id\":\"1\"}"));
    when(repository.markRead("u", "n")).thenReturn(Map.of("data", "invalid"));
    NotificationService service = new NotificationService(repository, new ObjectMapper());

    assertThat(((Map<?, ?>) service.create("u", "type", "title", "body", Map.of("id", "1")).get("data")).get("id")).isEqualTo("1");
    assertThat((Map<?, ?>) service.markRead("u", "n").get("data")).isEmpty();
  }

  @Test
  void listsNextCursorPageWithoutOffsetOrTotalQueries() {
    NotificationRepository repository = mock(NotificationRepository.class);
    String cursor = String.valueOf(CursorPages.response(List.of(
        Map.of("id", "anchor", "createdAt", "2026-05-26T10:00:00Z"),
        Map.of("id", "older", "createdAt", "2026-05-26T09:00:00Z")), 1, "createdAt").get("nextCursor"));
    when(repository.listForUser("u", false, "2026-05-26T10:00:00Z", "anchor", 2)).thenReturn(List.of());
    when(repository.countUnread("u")).thenReturn(0);
    NotificationService service = new NotificationService(repository, new ObjectMapper());

    Map<String, Object> response = service.list("u", false, 1, cursor);

    assertThat(response).containsEntry("nextCursor", null).containsEntry("unreadCount", 0);
    verify(repository).listForUser("u", false, "2026-05-26T10:00:00Z", "anchor", 2);
  }
}
