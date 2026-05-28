package com.illamhelp.api.audit;

import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {
  private final AuditEventRepository auditEventRepository;

  public AuditService(AuditEventRepository auditEventRepository) {
    this.auditEventRepository = auditEventRepository;
  }

  @Transactional
  public void logEvent(String actorUserId, String targetUserId, String eventType, String purpose, Map<String, Object> metadata) {
    auditEventRepository.save(new AuditEventEntity(
        actorUserId == null ? null : UUID.fromString(actorUserId),
        targetUserId == null ? null : UUID.fromString(targetUserId),
        eventType,
        purpose,
        metadata == null ? Map.of() : metadata));
  }
}
