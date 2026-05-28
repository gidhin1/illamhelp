package com.illamhelp.api.notifications;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<NotificationEntity, UUID> {
  @Query(value = """
      WITH created AS (
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (cast(:userId as uuid), cast(:type as notification_type), :title, :body, cast(:data as jsonb))
        RETURNING id, user_id, type, title, body, data, read, read_at, created_at
      )
      SELECT id, user_id AS "userId", type::text, title, body, data::text AS data,
             read, read_at AS "readAt", created_at AS "createdAt"
      FROM created
      """, nativeQuery = true)
  Map<String, Object> insert(@Param("userId") String userId, @Param("type") String type,
      @Param("title") String title, @Param("body") String body, @Param("data") String data);

  @Query(value = """
      SELECT id, user_id AS "userId", type::text, title, body, data::text AS data,
             read, read_at AS "readAt", created_at AS "createdAt"
      FROM notifications
      WHERE user_id = cast(:userId as uuid) AND (:unreadOnly = false OR read = false)
        AND (cast(:cursorCreatedAt as text) IS NULL
          OR (created_at, id) < (cast(:cursorCreatedAt as timestamptz), cast(:cursorId as uuid)))
      ORDER BY created_at DESC, id DESC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> listForUser(@Param("userId") String userId, @Param("unreadOnly") boolean unreadOnly,
      @Param("cursorCreatedAt") String cursorCreatedAt, @Param("cursorId") String cursorId, @Param("limit") int limit);

  @Query(value = "SELECT count(*) FROM notifications WHERE user_id = cast(:userId as uuid) AND read = false", nativeQuery = true)
  int countUnread(@Param("userId") String userId);

  @Query(value = """
      WITH changed AS (
        UPDATE notifications SET read = true, read_at = coalesce(read_at, now())
        WHERE id = cast(:id as uuid) AND user_id = cast(:userId as uuid)
        RETURNING id, user_id, type, title, body, data, read, read_at, created_at
      )
      SELECT id, user_id AS "userId", type::text, title, body, data::text AS data,
             read, read_at AS "readAt", created_at AS "createdAt" FROM changed
      """, nativeQuery = true)
  Map<String, Object> markRead(@Param("userId") String userId, @Param("id") String notificationId);

  @Modifying
  @Query(value = """
      UPDATE notifications SET read = true, read_at = coalesce(read_at, now())
      WHERE user_id = cast(:userId as uuid) AND read = false
      """, nativeQuery = true)
  int markAllRead(@Param("userId") String userId);
}
