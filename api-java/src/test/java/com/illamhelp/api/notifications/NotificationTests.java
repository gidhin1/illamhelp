package com.illamhelp.api.notifications;

import static com.illamhelp.api.TestFixtures.jwt;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class NotificationTests {
  @Test
  void controllerUsesAuthenticatedUserForNotificationOperations() {
    NotificationService service = mock(NotificationService.class);
    NotificationController controller = new NotificationController(service);
    controller.list(jwt("u1"), true, 3, 4);
    controller.unreadCount(jwt("u1"));
    controller.markRead(jwt("u1"), "n1");
    controller.markAllRead(jwt("u1"));
    verify(service).list("u1", true, 3, 4);
    verify(service).unreadCount("u1");
    verify(service).markRead("u1", "n1");
    verify(service).markAllRead("u1");
  }

  @Test
  void normalizesJsonDataAndPaginatesRepositoryResult() {
    NotificationRepository repository = mock(NotificationRepository.class);
    when(repository.listForUser("u1", true, 100, 0))
        .thenReturn(List.of(Map.of("data", "{\"verificationRequestId\":\"r1\"}", "type", "verification_approved")));
    when(repository.countForUser("u1", true)).thenReturn(1);
    when(repository.countUnread("u1")).thenReturn(1);
    NotificationService service = new NotificationService(repository, new ObjectMapper());

    Map<String, Object> response = service.list("u1", true, 999, -4);
    Map<?, ?> item = (Map<?, ?>) ((List<?>) response.get("items")).getFirst();

    assertThat(response).containsEntry("total", 1).containsEntry("limit", 100).containsEntry("offset", 0);
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
}
