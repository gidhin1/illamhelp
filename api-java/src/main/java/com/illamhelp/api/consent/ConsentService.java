package com.illamhelp.api.consent;

import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.common.CursorPages;
import com.illamhelp.api.notifications.NotificationService;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConsentService {
  private static final int MAX_ARRAY_RESULTS = 100;
  private static final Set<String> CONSENT_FIELDS = Set.of("phone", "alternate_phone", "email", "full_address");
  private final ConsentRepository consentRepository;
  private final OpaService opaService;
  private final AuditService auditService;
  private final NotificationService notificationService;

  public ConsentService(ConsentRepository consentRepository, OpaService opaService, AuditService auditService, NotificationService notificationService) {
    this.consentRepository = consentRepository;
    this.opaService = opaService;
    this.auditService = auditService;
    this.notificationService = notificationService;
  }

  public ConsentPage<AccessRequestRecord> requests(String userId, Integer limit, String cursorValue) {
    int pageSize = pageSize(limit);
    CursorPages.Cursor cursor = CursorPages.decode(cursorValue);
    List<AccessRequestRecord> rows = consentRepository.requests(userId, cursor.createdAt(), cursor.id(), pageSize + 1).stream()
        .map(this::toAccessRequestRecord)
        .toList();
    return toPage(rows, pageSize, AccessRequestRecord::createdAt);
  }

  public ConsentPage<GrantRecord> grants(String userId, Integer limit, String cursorValue) {
    int pageSize = pageSize(limit);
    CursorPages.Cursor cursor = CursorPages.decode(cursorValue);
    List<GrantRecord> rows = consentRepository.grants(userId, cursor.createdAt(), cursor.id(), pageSize + 1).stream()
        .map(this::toGrantRecord)
        .toList();
    return toPage(rows, pageSize, GrantRecord::grantedAt);
  }

  @Transactional
  public AccessRequestRecord requestAccess(String requesterUserId, RequestAccessInput body) {
    String ownerUserId = resolveInternalUserId(body.ownerUserId());
    String connectionId = body.connectionId();
    String[] requestedFields = textArray(body.requestedFields());
    String purpose = body.purpose() == null ? "contact_sharing" : body.purpose();
    validateFields(requestedFields, "requestedFields");
    if (requesterUserId.equals(ownerUserId)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Requester and owner must be different users");
    }
    ConsentRepository.ConnectionForConsentRow connection = consentRepository.connectionForConsent(connectionId);
    if (connection == null || !"accepted".equals(connection.getStatus())) {
      throw new ApiException(HttpStatus.BAD_REQUEST,
          "Mutual accepted connection is required before PII access request");
    }
    boolean requesterParticipant = requesterUserId.equals(connection.getUserAId())
        || requesterUserId.equals(connection.getUserBId());
    boolean ownerParticipant = ownerUserId.equals(connection.getUserAId())
        || ownerUserId.equals(connection.getUserBId());
    if (!requesterParticipant) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Requester is not part of the connection");
    }
    if (!ownerParticipant) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Owner is not part of the connection");
    }
    ConsentRepository.AccessRequestRow request = consentRepository.insertAccessRequest(
        requesterUserId, ownerUserId, connectionId, requestedFields, purpose);
    auditService.logEvent(requesterUserId, ownerUserId, "pii_access_requested", purpose,
        Map.of("requestId", request.getId()));
    return toAccessRequestRecord(request);
  }

  @Transactional
  public GrantRecord grant(String ownerUserId, String requestId, GrantAccessInput body) {
    ConsentRepository.AccessRequestCoreRow request = consentRepository.findAccessRequest(requestId);
    if (request == null) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Access request not found");
    }
    if (!ownerUserId.equals(request.getOwnerUserId())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only owner can grant PII access");
    }
    if (!"pending".equals(request.getStatus())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only pending access requests can be granted");
    }
    String[] grantedFields = textArray(body.grantedFields());
    validateFields(grantedFields, "grantedFields");
    Set<String> requestedFields = Set.copyOf(Arrays.asList(textArray(request.getRequestedFields())));
    for (String field : grantedFields) {
      if (!requestedFields.contains(field)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Granted field was not requested: " + field);
      }
    }
    String requesterUserId = request.getRequesterUserId();
    String connectionId = request.getConnectionId();
    String expiresAt = validExpiresAt(body.expiresAt());
    Object purpose = body.purpose() == null ? request.getPurpose() : body.purpose();
    ConsentRepository.GrantRow grant = consentRepository.grantPendingRequest(requestId, ownerUserId,
        grantedFields, purpose, expiresAt);
    if (grant == null) {
      throw new ApiException(HttpStatus.CONFLICT,
          "Access request is no longer pending or an active consent grant already exists.");
    }
    String granteeUserId = requesterUserId;
    auditService.logEvent(ownerUserId, granteeUserId, "pii_access_granted", String.valueOf(purpose),
        Map.of("requestId", requestId, "grantId", grant.getId()));
    notificationService.create(granteeUserId, "consent_grant_received", "Contact access granted",
        "A member granted access to requested contact details.", Map.of("grantId", grant.getId()));
    return toGrantRecord(grant);
  }

  @Transactional
  public GrantRecord revoke(String ownerUserId, String grantId, RevokeAccessInput body) {
    ConsentRepository.GrantRow revoked = consentRepository.revokeGrant(grantId, ownerUserId, body.reason());
    if (revoked == null) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Consent grant not found");
    }
    String granteeUserId = revoked.getGranteeUserId();
    auditService.logEvent(ownerUserId, granteeUserId, "pii_access_revoked", revoked.getPurpose(),
        Map.of("grantId", grantId));
    notificationService.create(granteeUserId, "consent_grant_revoked", "Contact access revoked",
        "A member revoked contact access.", Map.of("grantId", grantId));
    return toGrantRecord(revoked);
  }

  @Transactional
  public int revokeAllForConnection(String connectionId, String reason) {
    List<ConsentRepository.RevokedGrantRow> revoked = consentRepository.revokeActiveForConnection(connectionId, reason);
    for (ConsentRepository.RevokedGrantRow grant : revoked) {
      String ownerUserId = grant.getOwnerUserId();
      String granteeUserId = grant.getGranteeUserId();
      auditService.logEvent(ownerUserId, granteeUserId, "pii_access_revoked", "connection_blocked",
          Map.of("grantId", grant.getId(), "connectionId", connectionId, "reason", reason));
    }
    return revoked.size();
  }

  public CanViewResponse canView(String viewerUserId, CanViewInput body) {
    Object ownerIdentifier = body.ownerUserId();
    Object field = body.field();
    if (ownerIdentifier == null || field == null) {
      return new CanViewResponse(false);
    }
    validateFields(new String[]{field.toString()}, "field");
    String ownerUserId = resolveInternalUserId(ownerIdentifier.toString());
    List<ConsentRepository.ActiveGrantRow> grants = consentRepository.activeGrant(ownerUserId, viewerUserId, field.toString());
    if (grants.isEmpty()) {
      auditService.logEvent(viewerUserId, ownerUserId.toString(), "pii_access_checked", "consent_read_path",
          Map.of("field", field.toString(), "allowed", false, "reason", "no_active_grant"));
      return new CanViewResponse(false);
    }
    ConsentRepository.ActiveGrantRow grant = grants.getFirst();
    Map<String, Object> grantInput = new HashMap<>();
    grantInput.put("status", grant.getGrantStatus());
    grantInput.put("granted_fields", grant.getGrantedFields());
    if (grant.getExpiresAt() != null) {
      grantInput.put("expires_at", grant.getExpiresAt());
    }
    Map<String, Object> opaInput = new HashMap<>();
    opaInput.put("actor_id", viewerUserId);
    opaInput.put("owner_id", ownerUserId.toString());
    opaInput.put("field", field.toString());
    opaInput.put("relationship_status", grant.getRelationshipStatus());
    opaInput.put("grant", grantInput);
    boolean allowed = opaService.canViewPii(opaInput);
    auditService.logEvent(viewerUserId, ownerUserId.toString(), "pii_access_checked", "consent_read_path",
        Map.of("field", field.toString(), "allowed", allowed));
    return new CanViewResponse(allowed);
  }

  private String publicUserId(String userId) {
    return consentRepository.findUsername(userId);
  }

  private int pageSize(Integer limit) {
    return limit == null ? 50 : Math.max(1, Math.min(limit, MAX_ARRAY_RESULTS));
  }

  private String resolveInternalUserId(String identifier) {
    if (identifier.matches("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")) {
      return identifier;
    }
    return consentRepository.findUserIdByUsername(identifier);
  }

  private String[] textArray(Object value) {
    if (value instanceof List<?> values) {
      return values.stream().map(String::valueOf).toArray(String[]::new);
    }
    if (value instanceof String[] values) {
      return values;
    }
    return new String[0];
  }

  private void validateFields(String[] fields, String fieldName) {
    if (fields.length == 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, fieldName + " must include at least one field");
    }
    for (String field : fields) {
      if (!CONSENT_FIELDS.contains(field)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported consent field: " + field);
      }
    }
  }

  private String validExpiresAt(Object value) {
    if (value == null) {
      return null;
    }
    String expiresAt = String.valueOf(value);
    try {
      OffsetDateTime.parse(expiresAt);
      return expiresAt;
    } catch (DateTimeParseException exception) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "expiresAt must be an ISO-8601 timestamp with an offset");
    }
  }

  private AccessRequestRecord toAccessRequestRecord(ConsentRepository.AccessRequestRow item) {
    return new AccessRequestRecord(
        item.getId(),
        item.getRequesterPublicUserId() == null ? publicUserId(item.getRequesterUserId()) : item.getRequesterPublicUserId(),
        item.getOwnerPublicUserId() == null ? publicUserId(item.getOwnerUserId()) : item.getOwnerPublicUserId(),
        item.getConnectionId(),
        textList(item.getRequestedFields()),
        item.getPurpose(),
        item.getStatus(),
        item.getCreatedAt());
  }

  private GrantRecord toGrantRecord(ConsentRepository.GrantRow item) {
    return new GrantRecord(
        item.getId(),
        item.getAccessRequestId(),
        item.getOwnerPublicUserId() == null ? publicUserId(item.getOwnerUserId()) : item.getOwnerPublicUserId(),
        item.getGranteePublicUserId() == null ? publicUserId(item.getGranteeUserId()) : item.getGranteePublicUserId(),
        item.getConnectionId(),
        textList(item.getGrantedFields()),
        item.getPurpose(),
        item.getStatus(),
        item.getGrantedAt(),
        item.getExpiresAt(),
        item.getRevokedAt(),
        item.getRevokeReason());
  }

  private List<String> textList(Object value) {
    return Arrays.asList(textArray(value));
  }

  private <T> ConsentPage<T> toPage(List<T> rows, int limit, java.util.function.Function<T, String> orderedAt) {
    boolean hasMore = rows.size() > limit;
    List<T> items = hasMore ? rows.subList(0, limit) : rows;
    String nextCursor = null;
    if (hasMore && !items.isEmpty()) {
      Object last = items.getLast();
      String id = last instanceof AccessRequestRecord ar ? ar.id() : ((GrantRecord) last).id();
      String createdAt = orderedAt.apply(items.getLast());
      String raw = createdAt + "\u001f" + id;
      nextCursor = Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }
    return new ConsentPage<>(items, limit, nextCursor);
  }

  public record ConsentPage<T>(List<T> items, int limit, String nextCursor) {
  }

  public record RequestAccessInput(String ownerUserId, String connectionId, List<String> requestedFields, String purpose) {
  }

  public record GrantAccessInput(List<String> grantedFields, String expiresAt, String purpose) {
  }

  public record RevokeAccessInput(String reason) {
  }

  public record CanViewInput(String ownerUserId, String field) {
  }

  public record CanViewResponse(boolean allowed) {
  }

  public record AccessRequestRecord(String id, String requesterUserId, String ownerUserId, String connectionId,
      List<String> requestedFields, String purpose, String status, String createdAt) {
  }

  public record GrantRecord(String id, String accessRequestId, String ownerUserId, String granteeUserId, String connectionId,
      List<String> grantedFields, String purpose, String status, String grantedAt, String expiresAt, String revokedAt,
      String revokeReason) {
  }
}
