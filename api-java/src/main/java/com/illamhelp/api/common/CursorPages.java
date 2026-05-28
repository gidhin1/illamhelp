package com.illamhelp.api.common;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;

public final class CursorPages {
  private static final String SEPARATOR = "\u001f";

  private CursorPages() {
  }

  public static Cursor decode(String value) {
    if (value == null || value.isBlank()) {
      return new Cursor(null, null);
    }
    try {
      String decoded = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
      String[] parts = decoded.split(SEPARATOR, -1);
      if (parts.length != 2 || parts[0].isBlank() || parts[1].isBlank()) {
        throw new IllegalArgumentException("Incomplete cursor");
      }
      return new Cursor(parts[0], parts[1]);
    } catch (IllegalArgumentException exception) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid pagination cursor");
    }
  }

  public static Map<String, Object> response(List<Map<String, Object>> rows, int limit, String orderedField) {
    boolean hasMore = rows.size() > limit;
    List<Map<String, Object>> items = hasMore ? rows.subList(0, limit) : rows;
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("items", items);
    response.put("limit", limit);
    response.put("nextCursor", hasMore ? encode(items.getLast(), orderedField) : null);
    return response;
  }

  private static String encode(Map<String, Object> row, String orderedField) {
    String value = String.valueOf(row.get(orderedField)) + SEPARATOR + String.valueOf(row.get("id"));
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }

  public record Cursor(String createdAt, String id) {
  }
}
