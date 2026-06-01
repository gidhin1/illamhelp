package com.illamhelp.api.notifications;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.common.CursorPages;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
  private static final String CURSOR_SEPARATOR = "\u001f";
  private final NotificationRepository notificationRepository;
  private final ObjectMapper objectMapper;

  public NotificationService(NotificationRepository notificationRepository, ObjectMapper objectMapper) {
    this.notificationRepository = notificationRepository;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public NotificationRecord create(String userId, String type, String title, String body, Map<String, Object> data) {
    return toRecord(notificationRepository.insert(userId, type, title, body, json(data == null ? Map.of() : data)));
  }

  public NotificationListResponse list(String userId, boolean unreadOnly, Integer limit, String cursorValue) {
    int safeLimit = limit == null ? 50 : Math.max(1, Math.min(limit, 100));
    CursorPages.Cursor cursor = CursorPages.decode(cursorValue);
    List<NotificationRecord> rows = notificationRepository.listForUser(userId, unreadOnly,
        cursor.createdAt(), cursor.id(), safeLimit + 1).stream().map(this::toRecord).toList();
    boolean hasMore = rows.size() > safeLimit;
    List<NotificationRecord> items = hasMore ? rows.subList(0, safeLimit) : rows;
    String nextCursor = hasMore ? encodeCursor(items.getLast()) : null;
    return new NotificationListResponse(items, safeLimit, nextCursor, notificationRepository.countUnread(userId));
  }

  public UnreadCountResponse unreadCount(String userId) {
    return new UnreadCountResponse(notificationRepository.countUnread(userId));
  }

  @Transactional
  public NotificationRecord markRead(String userId, String notificationId) {
    return toRecord(notificationRepository.markRead(userId, notificationId));
  }

  @Transactional
  public UpdatedCountResponse markAllRead(String userId) {
    return new UpdatedCountResponse(notificationRepository.markAllRead(userId));
  }

  private String json(Map<String, Object> data) {
    try {
      return objectMapper.writeValueAsString(data);
    } catch (JsonProcessingException exception) {
      return "{}";
    }
  }

  private NotificationRecord toRecord(NotificationRepository.NotificationRow row) {
    if (row == null) {
      return null;
    }
    Map<String, Object> parsedData;
    try {
      parsedData = objectMapper.readValue(String.valueOf(row.getData()), new TypeReference<>() {
      });
    } catch (JsonProcessingException exception) {
      parsedData = Map.of();
    }
    return new NotificationRecord(
        row.getId(),
        row.getUserId(),
        row.getType(),
        row.getTitle(),
        row.getBody(),
        parsedData,
        row.getRead(),
        row.getReadAt(),
        row.getCreatedAt());
  }

  public record NotificationRecord(
      String id,
      String userId,
      String type,
      String title,
      String body,
      Map<String, Object> data,
      boolean read,
      String readAt,
      String createdAt) {
  }

  public record NotificationListResponse(List<NotificationRecord> items, int limit, String nextCursor, int unreadCount) {
  }

  public record UnreadCountResponse(int unreadCount) {
  }

  public record UpdatedCountResponse(int updated) {
  }

  private String encodeCursor(NotificationRecord row) {
    String value = row.createdAt() + CURSOR_SEPARATOR + row.id();
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }
}
