package com.illamhelp.api.consent;

import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.notifications.NotificationService;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConsentService {
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

  public List<Map<String, Object>> requests(String userId) {
    return consentRepository.requests(userId).stream()
        .map(item -> publicize(item, "requesterUserId", "ownerUserId"))
        .toList();
  }

  public List<Map<String, Object>> grants(String userId) {
    return consentRepository.grants(userId).stream()
        .map(item -> publicize(item, "ownerUserId", "granteeUserId"))
        .toList();
  }

  @Transactional
  public Map<String, Object> requestAccess(String requesterUserId, Map<String, Object> body) {
    Map<String, Object> params = new HashMap<>();
    params.put("requesterUserId", requesterUserId);
    String ownerUserId = resolveInternalUserId(String.valueOf(body.get("ownerUserId")));
    params.put("ownerUserId", ownerUserId);
    params.put("connectionId", body.get("connectionId"));
    params.put("requestedFields", textArray(body.get("requestedFields")));
    params.put("purpose", body.getOrDefault("purpose", "contact_sharing"));
    String[] requestedFields = (String[]) params.get("requestedFields");
    validateFields(requestedFields, "requestedFields");
    if (requesterUserId.equals(ownerUserId)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Requester and owner must be different users");
    }
    Map<String, Object> connection = consentRepository.connectionForConsent(String.valueOf(params.get("connectionId")));
    if (connection == null || connection.isEmpty() || !"accepted".equals(String.valueOf(connection.get("status")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST,
          "Mutual accepted connection is required before PII access request");
    }
    boolean requesterParticipant = requesterUserId.equals(String.valueOf(connection.get("userAId")))
        || requesterUserId.equals(String.valueOf(connection.get("userBId")));
    boolean ownerParticipant = ownerUserId.equals(String.valueOf(connection.get("userAId")))
        || ownerUserId.equals(String.valueOf(connection.get("userBId")));
    if (!requesterParticipant) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Requester is not part of the connection");
    }
    if (!ownerParticipant) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Owner is not part of the connection");
    }
    Map<String, Object> request = consentRepository.insertAccessRequest(requesterUserId, ownerUserId,
        params.get("connectionId"), requestedFields, params.get("purpose"));
    auditService.logEvent(requesterUserId, ownerUserId, "pii_access_requested", String.valueOf(params.get("purpose")),
        Map.of("requestId", String.valueOf(request.get("id"))));
    return publicize(request, "requesterUserId", "ownerUserId");
  }

  @Transactional
  public Map<String, Object> grant(String ownerUserId, String requestId, Map<String, Object> body) {
    Map<String, Object> request = consentRepository.findAccessRequest(requestId);
    if (request == null || request.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Access request not found");
    }
    if (!ownerUserId.equals(String.valueOf(request.get("ownerUserId")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only owner can grant PII access");
    }
    if (!"pending".equals(String.valueOf(request.get("status")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only pending access requests can be granted");
    }
    String[] grantedFields = textArray(body.get("grantedFields"));
    validateFields(grantedFields, "grantedFields");
    Set<String> requestedFields = Set.copyOf(Arrays.asList(textArray(request.get("requestedFields"))));
    for (String field : grantedFields) {
      if (!requestedFields.contains(field)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Granted field was not requested: " + field);
      }
    }
    String requesterUserId = String.valueOf(request.get("requesterUserId"));
    String connectionId = String.valueOf(request.get("connectionId"));
    if (consentRepository.hasActiveGrant(ownerUserId, requesterUserId, connectionId)) {
      throw new ApiException(HttpStatus.BAD_REQUEST,
          "An active consent grant already exists for this connection. Revoke it first or wait for it to expire.");
    }
    String expiresAt = validExpiresAt(body.get("expiresAt"));
    consentRepository.approveAccessRequest(requestId, ownerUserId);
    Object purpose = body.getOrDefault("purpose", request.get("purpose"));
    Map<String, Object> grant = consentRepository.insertGrant(requestId, ownerUserId,
        requesterUserId, connectionId, grantedFields, purpose, expiresAt);
    String granteeUserId = requesterUserId;
    auditService.logEvent(ownerUserId, granteeUserId, "pii_access_granted", String.valueOf(purpose),
        Map.of("requestId", requestId, "grantId", String.valueOf(grant.get("id"))));
    notificationService.create(granteeUserId, "consent_grant_received", "Contact access granted",
        "A member granted access to requested contact details.", Map.of("grantId", String.valueOf(grant.get("id"))));
    return publicize(grant, "ownerUserId", "granteeUserId");
  }

  @Transactional
  public Map<String, Object> revoke(String ownerUserId, String grantId, Map<String, Object> body) {
    Map<String, Object> params = new HashMap<>();
    params.put("ownerUserId", ownerUserId);
    params.put("grantId", grantId);
    params.put("reason", body.get("reason"));
    Map<String, Object> revoked = consentRepository.revokeGrant(grantId, ownerUserId, params.get("reason"));
    String granteeUserId = String.valueOf(revoked.get("granteeUserId"));
    auditService.logEvent(ownerUserId, granteeUserId, "pii_access_revoked", String.valueOf(revoked.get("purpose")),
        Map.of("grantId", grantId));
    notificationService.create(granteeUserId, "consent_grant_revoked", "Contact access revoked",
        "A member revoked contact access.", Map.of("grantId", grantId));
    return publicize(revoked, "ownerUserId", "granteeUserId");
  }

  @Transactional
  public int revokeAllForConnection(String connectionId, String reason) {
    List<Map<String, Object>> revoked = consentRepository.revokeActiveForConnection(connectionId, reason);
    for (Map<String, Object> grant : revoked) {
      String ownerUserId = String.valueOf(grant.get("ownerUserId"));
      String granteeUserId = String.valueOf(grant.get("granteeUserId"));
      auditService.logEvent(ownerUserId, granteeUserId, "pii_access_revoked", "connection_blocked",
          Map.of("grantId", String.valueOf(grant.get("id")), "connectionId", connectionId, "reason", reason));
    }
    return revoked.size();
  }

  public Map<String, Object> canView(String viewerUserId, Map<String, Object> body) {
    Object ownerIdentifier = body.get("ownerUserId");
    Object field = body.get("field");
    if (ownerIdentifier == null || field == null) {
      return Map.of("allowed", false);
    }
    validateFields(new String[]{field.toString()}, "field");
    String ownerUserId = resolveInternalUserId(ownerIdentifier.toString());
    List<Map<String, Object>> grants = consentRepository.activeGrant(ownerUserId, viewerUserId, field.toString());
    if (grants.isEmpty()) {
      auditService.logEvent(viewerUserId, ownerUserId.toString(), "pii_access_checked", "consent_read_path",
          Map.of("field", field.toString(), "allowed", false, "reason", "no_active_grant"));
      return Map.of("allowed", false);
    }
    Map<String, Object> grant = grants.getFirst();
    Map<String, Object> grantInput = new HashMap<>();
    grantInput.put("status", String.valueOf(grant.get("grant_status")));
    grantInput.put("granted_fields", grant.get("granted_fields"));
    if (grant.get("expires_at") != null) {
      grantInput.put("expires_at", grant.get("expires_at").toString());
    }
    Map<String, Object> opaInput = new HashMap<>();
    opaInput.put("actor_id", viewerUserId);
    opaInput.put("owner_id", ownerUserId.toString());
    opaInput.put("field", field.toString());
    opaInput.put("relationship_status", String.valueOf(grant.get("relationship_status")));
    opaInput.put("grant", grantInput);
    boolean allowed = opaService.canViewPii(opaInput);
    auditService.logEvent(viewerUserId, ownerUserId.toString(), "pii_access_checked", "consent_read_path",
        Map.of("field", field.toString(), "allowed", allowed));
    return Map.of("allowed", allowed);
  }

  private Map<String, Object> publicize(Map<String, Object> item, String... fields) {
    Map<String, Object> result = new LinkedHashMap<>(item);
    for (String field : fields) {
      Object userId = item.get(field);
      if (userId != null) {
        result.put(field, publicUserId(userId.toString()));
      }
    }
    return result;
  }

  private String publicUserId(String userId) {
    return consentRepository.findUsername(userId);
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
}
