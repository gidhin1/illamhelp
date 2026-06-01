package com.illamhelp.api.connections;

import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.common.CursorPages;
import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.consent.ConsentService;
import com.illamhelp.api.notifications.NotificationService;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConnectionsService {
  private static final String CURSOR_SEPARATOR = "\u001f";
  private final ConnectionRepository connectionRepository;
  private final ConsentService consentService;
  private final AuditService auditService;
  private final NotificationService notificationService;

  public ConnectionsService(ConnectionRepository connectionRepository, ConsentService consentService, AuditService auditService,
      NotificationService notificationService) {
    this.connectionRepository = connectionRepository;
    this.consentService = consentService;
    this.auditService = auditService;
    this.notificationService = notificationService;
  }

  public ConnectionListResponse list(String userId, Integer limit, String cursorValue) {
    int safeLimit = limit == null ? 50 : Math.max(1, Math.min(limit, 100));
    CursorPages.Cursor cursor = CursorPages.decode(cursorValue);
    List<ConnectionRecord> rows = connectionRepository.listForUser(userId, cursor.createdAt(), cursor.id(), safeLimit + 1)
        .stream().map(this::toConnectionRecord).toList();
    boolean hasMore = rows.size() > safeLimit;
    List<ConnectionRecord> items = hasMore ? rows.subList(0, safeLimit) : rows;
    String nextCursor = hasMore ? encodeCursor(items.getLast()) : null;
    return new ConnectionListResponse(items, safeLimit, nextCursor);
  }

  public List<ConnectionSearchCandidate> search(String userId, String q, Integer limit) {
    int safeLimit = limit == null ? 20 : Math.max(1, Math.min(limit, 20));
    String normalizedQuery = q == null ? "" : q.trim().toLowerCase();
    String needle = "%" + normalizedQuery + "%";
    return connectionRepository.searchCandidates(userId, normalizedQuery, needle, safeLimit).stream()
        .map(this::toSearchCandidate).toList();
  }

  @Transactional
  public ConnectionRecord request(String requesterUserId, ConnectionRequestInput input) {
    String target = input.targetUserId();
    if (target == null || target.isBlank()) {
      target = input.targetQuery();
    }
    if (target == null || target.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Provide targetUserId or targetQuery");
    }
    String targetUserId = resolveInternalUserId(target);
    if (requesterUserId.equals(targetUserId)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Requester and target cannot be the same user");
    }
    ConnectionRepository.ConnectionRow existing = connectionRepository.findBetween(requesterUserId, targetUserId);
    if (existing != null && !"declined".equals(existing.getStatus())) {
      return toConnectionRecord(existing);
    }
    ConnectionRepository.ConnectionRow connection = connectionRepository.requestConnection(requesterUserId, targetUserId);
    boolean changed = connection != null;
    if (!changed) {
      connection = connectionRepository.findBetween(requesterUserId, targetUserId);
    }
    if (existing == null && changed) {
      auditService.logEvent(requesterUserId, targetUserId, "connection_requested", null,
          Map.of("connectionId", connection.getId()));
      notificationService.create(targetUserId, "connection_request_received", "Connection request",
          "You received a new connection request.", Map.of("connectionId", connection.getId()));
    }
    return toConnectionRecord(connection);
  }

  @Transactional
  public ConnectionRecord decide(String id, String actorUserId, String status) {
    ConnectionRepository.ConnectionRow current = connectionRepository.findConnection(id);
    if (current == null) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Connection not found");
    }
    boolean participant = actorUserId.equals(current.getUserAId())
        || actorUserId.equals(current.getUserBId());
    if (!participant) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Actor is not part of this connection");
    }
    String currentStatus = current.getStatus();
    String requester = current.getRequestedByUserId();
    if ("blocked".equals(status) && "blocked".equals(currentStatus)) {
      return toConnectionRecord(current);
    }
    if (List.of("accepted", "declined").contains(status) && !"pending".equals(currentStatus)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only pending connections can be " + status);
    }
    if ("accepted".equals(status) && actorUserId.equals(requester)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot accept your own connection request");
    }
    ConnectionRepository.ConnectionRow connection = connectionRepository.decideConnection(id, actorUserId, status);
    if (connection == null) {
      throw new ApiException(HttpStatus.CONFLICT, "Connection state changed before this operation completed");
    }
    auditService.logEvent(actorUserId, requester, "connection_" + status, null, Map.of("connectionId", id));
    if ("accepted".equals(status)) {
      notificationService.create(requester, "connection_request_accepted", "Connection accepted",
          "Your connection request was accepted.", Map.of("connectionId", id));
    } else if ("declined".equals(status)) {
      notificationService.create(requester, "connection_request_declined", "Connection declined",
          "Your connection request was declined.", Map.of("connectionId", id));
    }
    if ("blocked".equals(status)) {
      consentService.revokeAllForConnection(id, "Connection blocked by participant");
    }
    return toConnectionRecord(connection);
  }

  private ConnectionRecord toConnectionRecord(ConnectionRepository.ConnectionRow connection) {
    String userAId = connection.getUserAPublicId() != null
        ? connection.getUserAPublicId() : publicUserId(connection.getUserAId());
    String userBId = connection.getUserBPublicId() != null
        ? connection.getUserBPublicId() : publicUserId(connection.getUserBId());
    String requestedByUserId = connection.getRequestedByPublicId() != null
        ? connection.getRequestedByPublicId() : publicUserId(connection.getRequestedByUserId());
    return new ConnectionRecord(
        connection.getId(),
        userAId,
        userBId,
        requestedByUserId,
        connection.getStatus(),
        connection.getRequestedAt(),
        connection.getDecidedAt());
  }

  private ConnectionSearchCandidate toSearchCandidate(ConnectionRepository.SearchCandidateRow row) {
    return new ConnectionSearchCandidate(
        row.getUserId(),
        row.getDisplayName(),
        row.getLocationLabel(),
        csvToList(row.getServiceCategories()),
        csvToList(row.getRecentJobCategories()),
        csvToList(row.getRecentLocations()));
  }

  private List<String> csvToList(String value) {
    if (value == null || value.isBlank()) {
      return List.of();
    }
    return Arrays.stream(value.replace("{", "").replace("}", "").split(","))
        .map(String::trim)
        .filter(v -> !v.isBlank())
        .toList();
  }

  private String resolveInternalUserId(String identifier) {
    if (identifier.matches("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")) {
      return identifier;
    }
    return connectionRepository.findInternalUserIdByUsername(identifier.trim());
  }

  private String publicUserId(Object userId) {
    if (userId == null) {
      return null;
    }
    return connectionRepository.findPublicUserId(String.valueOf(userId));
  }

  private String encodeCursor(ConnectionRecord row) {
    String value = row.requestedAt() + CURSOR_SEPARATOR + row.id();
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }

  public record ConnectionRequestInput(String targetUserId, String targetQuery) {
  }

  public record ConnectionRecord(String id, String userAId, String userBId, String requestedByUserId,
      String status, String requestedAt, String decidedAt) {
  }

  public record ConnectionListResponse(List<ConnectionRecord> items, int limit, String nextCursor) {
  }

  public record ConnectionSearchCandidate(String userId, String displayName, String locationLabel,
      List<String> serviceCategories, List<String> recentJobCategories, List<String> recentLocations) {
  }
}
