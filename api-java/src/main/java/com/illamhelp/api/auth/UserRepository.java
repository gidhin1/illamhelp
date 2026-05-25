package com.illamhelp.api.auth;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<UserEntity, UUID> {
  Optional<UserEntity> findByUsernameIgnoreCase(String username);

  @Modifying
  @Query(value = """
      INSERT INTO users (id, role, username)
      VALUES (cast(:userId as uuid), cast(:role as user_role), :username)
      ON CONFLICT (id)
      DO UPDATE SET role = EXCLUDED.role,
        username = COALESCE(NULLIF(EXCLUDED.username, ''), users.username),
        updated_at = now()
      """, nativeQuery = true)
  void upsertFromToken(@Param("userId") String userId, @Param("role") String role, @Param("username") String username);
}
