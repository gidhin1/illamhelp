package com.illamhelp.api.connections;

import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.common.CursorPages;
import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.consent.ConsentService;
import com.illamhelp.api.notifications.NotificationService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConnectionsService {
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

  public Map<String, Object> list(String userId, Integer limit, String cursorValue) {
    int safeLimit = limit == null ? 50 : Math.max(1, Math.min(limit, 100));
    CursorPages.Cursor cursor = CursorPages.decode(cursorValue);
    List<Map<String, Object>> rows = connectionRepository.listForUser(userId, cursor.createdAt(), cursor.id(), safeLimit + 1);
    Map<String, Object> page = CursorPages.response(rows, safeLimit, "requestedAt");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> items = (List<Map<String, Object>>) page.get("items");
    page.put("items", items.stream().map(this::publicizeConnection).toList());
    return page;
  }

  public List<Map<String, Object>> search(String userId, String q, Integer limit) {
    int safeLimit = limit == null ? 20 : Math.max(1, Math.min(limit, 20));
    String normalizedQuery = q == null ? "" : q.trim().toLowerCase();
    String needle = "%" + normalizedQuery + "%";
    return connectionRepository.searchCandidates(userId, normalizedQuery, needle, safeLimit);
  }

  @Transactional
  public Map<String, Object> request(String requesterUserId, Map<String, Object> body) {
    Object target = body.get("targetUserId");
    if (target == null) {
      target = body.get("targetQuery");
    }
    if (target == null || target.toString().isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Provide targetUserId or targetQuery");
    }
    String targetUserId = resolveInternalUserId(target.toString());
    if (requesterUserId.equals(targetUserId)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Requester and target cannot be the same user");
    }
    Map<String, Object> existing = connectionRepository.findBetween(requesterUserId, targetUserId);
    if (existing != null && !existing.isEmpty() && !"declined".equals(String.valueOf(existing.get("status")))) {
      return publicizeConnection(existing);
    }
    Map<String, Object> connection = connectionRepository.requestConnection(requesterUserId, targetUserId);
    boolean changed = connection != null && !connection.isEmpty();
    if (!changed) {
      connection = connectionRepository.findBetween(requesterUserId, targetUserId);
    }
    if ((existing == null || existing.isEmpty()) && changed) {
      auditService.logEvent(requesterUserId, targetUserId, "connection_requested", null,
          Map.of("connectionId", String.valueOf(connection.get("id"))));
      notificationService.create(targetUserId, "connection_request_received", "Connection request",
          "You received a new connection request.", Map.of("connectionId", String.valueOf(connection.get("id"))));
    }
    return publicizeConnection(connection);
  }

  @Transactional
  public Map<String, Object> decide(String id, String actorUserId, String status) {
    Map<String, Object> current = connectionRepository.findConnection(id);
    if (current == null || current.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Connection not found");
    }
    boolean participant = actorUserId.equals(String.valueOf(current.get("userAId")))
        || actorUserId.equals(String.valueOf(current.get("userBId")));
    if (!participant) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Actor is not part of this connection");
    }
    String currentStatus = String.valueOf(current.get("status"));
    String requester = String.valueOf(current.get("requestedByUserId"));
    if ("blocked".equals(status) && "blocked".equals(currentStatus)) {
      return publicizeConnection(current);
    }
    if (List.of("accepted", "declined").contains(status) && !"pending".equals(currentStatus)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only pending connections can be " + status);
    }
    if ("accepted".equals(status) && actorUserId.equals(requester)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot accept your own connection request");
    }
    Map<String, Object> connection = connectionRepository.decideConnection(id, actorUserId, status);
    if (connection == null || connection.isEmpty()) {
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
    return publicizeConnection(connection);
  }

  private Map<String, Object> publicizeConnection(Map<String, Object> connection) {
    Map<String, Object> publicConnection = new LinkedHashMap<>(connection);
    publicConnection.put("userAId", connection.containsKey("userAPublicId")
        ? connection.get("userAPublicId") : publicUserId(connection.get("userAId")));
    publicConnection.put("userBId", connection.containsKey("userBPublicId")
        ? connection.get("userBPublicId") : publicUserId(connection.get("userBId")));
    publicConnection.put("requestedByUserId", connection.containsKey("requestedByPublicId")
        ? connection.get("requestedByPublicId") : publicUserId(connection.get("requestedByUserId")));
    publicConnection.remove("userAPublicId");
    publicConnection.remove("userBPublicId");
    publicConnection.remove("requestedByPublicId");
    return publicConnection;
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
}
