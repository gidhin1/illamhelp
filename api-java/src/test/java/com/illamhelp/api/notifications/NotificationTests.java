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
        .thenReturn(List.of(row("n", "u1", "verification_approved", "title", "body",
            "{\"verificationRequestId\":\"r1\"}", false, null, "2026-05-26T10:00:00Z")));
    when(repository.countUnread("u1")).thenReturn(1);
    NotificationService service = new NotificationService(repository, new ObjectMapper());

    NotificationService.NotificationListResponse response = service.list("u1", true, 999, null);
    NotificationService.NotificationRecord item = response.items().getFirst();

    assertThat(response.unreadCount()).isEqualTo(1);
    assertThat(response.limit()).isEqualTo(100);
    assertThat(item.data().get("verificationRequestId")).isEqualTo("r1");
  }

  @Test
  void serializesCreationDataAndNormalizesReadPayload() {
    NotificationRepository repository = mock(NotificationRepository.class);
    when(repository.insert("u", "type", "title", "body", "{\"id\":\"1\"}"))
        .thenReturn(row("n1", "u", "type", "title", "body", "{\"id\":\"1\"}", false, null, "2026-05-26T10:00:00Z"));
    when(repository.markRead("u", "n"))
        .thenReturn(row("n", "u", "type", "title", "body", "invalid", true, "2026-05-26T10:00:00Z", "2026-05-26T09:00:00Z"));
    NotificationService service = new NotificationService(repository, new ObjectMapper());

    assertThat(service.create("u", "type", "title", "body", Map.of("id", "1")).data().get("id")).isEqualTo("1");
    assertThat(service.markRead("u", "n").data()).isEmpty();
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

    NotificationService.NotificationListResponse response = service.list("u", false, 1, cursor);

    assertThat(response.nextCursor()).isNull();
    assertThat(response.unreadCount()).isEqualTo(0);
    verify(repository).listForUser("u", false, "2026-05-26T10:00:00Z", "anchor", 2);
  }

  private static NotificationRepository.NotificationRow row(
      String id,
      String userId,
      String type,
      String title,
      String body,
      String data,
      boolean read,
      String readAt,
      String createdAt) {
    return new NotificationRepository.NotificationRow() {
      @Override
      public String getId() { return id; }
      @Override
      public String getUserId() { return userId; }
      @Override
      public String getType() { return type; }
      @Override
      public String getTitle() { return title; }
      @Override
      public String getBody() { return body; }
      @Override
      public String getData() { return data; }
      @Override
      public boolean getRead() { return read; }
      @Override
      public String getReadAt() { return readAt; }
      @Override
      public String getCreatedAt() { return createdAt; }
    };
  }
}
