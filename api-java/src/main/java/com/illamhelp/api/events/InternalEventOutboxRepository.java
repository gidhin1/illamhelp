package com.illamhelp.api.events;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InternalEventOutboxRepository extends JpaRepository<InternalEventOutboxEntity, UUID> {
}
