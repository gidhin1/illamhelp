package com.illamhelp.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.illamhelp.api.IllamHelpApiApplication;
import com.illamhelp.api.audit.AuditEventEntity;
import com.illamhelp.api.audit.AuditEventRepository;
import com.illamhelp.api.auth.UserEntity;
import com.illamhelp.api.auth.UserRepository;
import com.illamhelp.api.connections.ConnectionEntity;
import com.illamhelp.api.connections.ConnectionRepository;
import com.illamhelp.api.consent.ConsentGrantEntity;
import com.illamhelp.api.consent.ConsentRepository;
import com.illamhelp.api.events.InternalEventOutboxEntity;
import com.illamhelp.api.events.InternalEventOutboxRepository;
import com.illamhelp.api.jobs.JobEntity;
import com.illamhelp.api.jobs.JobRepository;
import com.illamhelp.api.media.MediaAssetEntity;
import com.illamhelp.api.media.MediaAssetRepository;
import com.illamhelp.api.notifications.NotificationEntity;
import com.illamhelp.api.notifications.NotificationRepository;
import com.illamhelp.api.profiles.ProfileEntity;
import com.illamhelp.api.profiles.ProfileRepository;
import com.illamhelp.api.profiles.VerificationRequestEntity;
import com.illamhelp.api.profiles.VerificationRequestRepository;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.lang.reflect.Method;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

class PersistenceContractTest {
  @Test
  void applicationIsSpringBootEntryPoint() {
    assertThat(IllamHelpApiApplication.class).hasAnnotation(SpringBootApplication.class);
  }

  @Test
  void entitiesMapToPreservedDatabaseTables() {
    Map<Class<?>, String> entities = Map.of(
        AuditEventEntity.class, "audit_events",
        UserEntity.class, "users",
        ConnectionEntity.class, "connections",
        ConsentGrantEntity.class, "pii_consent_grants",
        InternalEventOutboxEntity.class, "internal_event_outbox",
        JobEntity.class, "jobs",
        MediaAssetEntity.class, "media_assets",
        NotificationEntity.class, "notifications",
        ProfileEntity.class, "profiles",
        VerificationRequestEntity.class, "verification_requests");

    entities.forEach((type, table) -> {
      assertThat(type).hasAnnotation(Entity.class);
      assertThat(type.getAnnotation(Table.class).name()).isEqualTo(table);
    });
  }

  @Test
  void springDataRepositoriesOwnDeclaredNativeQueries() {
    Class<?>[] repositories = {
        AuditEventRepository.class, UserRepository.class, ConnectionRepository.class, ConsentRepository.class,
        InternalEventOutboxRepository.class, JobRepository.class, MediaAssetRepository.class, NotificationRepository.class, ProfileRepository.class,
        VerificationRequestRepository.class
    };

    for (Class<?> repository : repositories) {
      assertThat(JpaRepository.class).isAssignableFrom(repository);
      assertThat(java.util.Arrays.stream(repository.getDeclaredMethods())
          .filter(method -> method.isAnnotationPresent(Query.class))
          .map(method -> method.getAnnotation(Query.class))
          .allMatch(Query::nativeQuery)).isTrue();
    }
  }
}
