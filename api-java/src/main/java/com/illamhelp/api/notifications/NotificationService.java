package com.illamhelp.api.notifications;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.common.CursorPages;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
  private final NotificationRepository notificationRepository;
  private final ObjectMapper objectMapper;

  public NotificationService(NotificationRepository notificationRepository, ObjectMapper objectMapper) {
    this.notificationRepository = notificationRepository;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public Map<String, Object> create(String userId, String type, String title, String body, Map<String, Object> data) {
    return normalizeData(notificationRepository.insert(userId, type, title, body, json(data == null ? Map.of() : data)));
  }

  public Map<String, Object> list(String userId, boolean unreadOnly, Integer limit, String cursorValue) {
    int safeLimit = limit == null ? 50 : Math.max(1, Math.min(limit, 100));
    CursorPages.Cursor cursor = CursorPages.decode(cursorValue);
    List<Map<String, Object>> rows = notificationRepository.listForUser(userId, unreadOnly,
        cursor.createdAt(), cursor.id(), safeLimit + 1);
    Map<String, Object> page = CursorPages.response(rows, safeLimit, "createdAt");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> items = (List<Map<String, Object>>) page.get("items");
    page.put("items", items.stream().map(this::normalizeData).toList());
    page.put("unreadCount", notificationRepository.countUnread(userId));
    return page;
  }

  public Map<String, Integer> unreadCount(String userId) {
    return Map.of("unreadCount", notificationRepository.countUnread(userId));
  }

  @Transactional
  public Map<String, Object> markRead(String userId, String notificationId) {
    return normalizeData(notificationRepository.markRead(userId, notificationId));
  }

  @Transactional
  public Map<String, Integer> markAllRead(String userId) {
    return Map.of("updated", notificationRepository.markAllRead(userId));
  }

  private String json(Map<String, Object> data) {
    try {
      return objectMapper.writeValueAsString(data);
    } catch (JsonProcessingException exception) {
      return "{}";
    }
  }

  private Map<String, Object> normalizeData(Map<String, Object> row) {
    if (row == null || row.get("data") == null || row.get("data") instanceof Map<?, ?>) {
      return row;
    }
    Map<String, Object> normalized = new LinkedHashMap<>(row);
    try {
      normalized.put("data", objectMapper.readValue(String.valueOf(row.get("data")), Map.class));
    } catch (JsonProcessingException exception) {
      normalized.put("data", Map.of());
    }
    return normalized;
  }
}
