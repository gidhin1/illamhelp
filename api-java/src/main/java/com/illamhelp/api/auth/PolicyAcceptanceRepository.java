package com.illamhelp.api.auth;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PolicyAcceptanceRepository extends JpaRepository<PolicyAcceptanceEntity, UUID> {
}
