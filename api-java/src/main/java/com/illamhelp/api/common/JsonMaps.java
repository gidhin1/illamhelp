package com.illamhelp.api.common;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public final class JsonMaps {
  private JsonMaps() {
  }

  public static String string(Map<String, Object> row, String key) {
    Object value = row.get(key);
    return value == null ? null : String.valueOf(value);
  }

  public static String uuid(Map<String, Object> row, String key) {
    Object value = row.get(key);
    return value == null ? null : value instanceof UUID uuid ? uuid.toString() : String.valueOf(value);
  }

  public static String instant(Map<String, Object> row, String key) {
    Object value = row.get(key);
    if (value == null) {
      return null;
    }
    if (value instanceof Instant instant) {
      return instant.toString();
    }
    if (value instanceof Timestamp timestamp) {
      return timestamp.toInstant().toString();
    }
    return String.valueOf(value);
  }

  public static Integer integer(Map<String, Object> row, String key) {
    Object value = row.get(key);
    return value instanceof Number number ? number.intValue() : null;
  }

  public static Long longValue(Map<String, Object> row, String key) {
    Object value = row.get(key);
    return value instanceof Number number ? number.longValue() : null;
  }

  public static BigDecimal decimal(Map<String, Object> row, String key) {
    Object value = row.get(key);
    return value instanceof BigDecimal decimal ? decimal : null;
  }
}
