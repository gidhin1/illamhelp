package com.illamhelp.api.profiles;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProfileRepository extends JpaRepository<ProfileEntity, UUID> {
  Optional<ProfileEntity> findByUserId(UUID userId);

  @Query(value = """
      SELECT
        (SELECT count(*)::int FROM jobs WHERE seeker_user_id = cast(:userId as uuid)) AS "totalJobs",
        (SELECT count(*)::int FROM connections WHERE user_a_id = cast(:userId as uuid) OR user_b_id = cast(:userId as uuid)) AS "totalConnections",
        (SELECT count(*)::int FROM connections WHERE (user_a_id = cast(:userId as uuid) OR user_b_id = cast(:userId as uuid)) AND status = 'pending') AS "pendingConnections",
        (SELECT count(*)::int FROM pii_access_requests WHERE requester_user_id = cast(:userId as uuid) OR owner_user_id = cast(:userId as uuid)) AS "consentRequests",
        (SELECT count(*)::int FROM pii_consent_grants WHERE (owner_user_id = cast(:userId as uuid) OR grantee_user_id = cast(:userId as uuid)) AND status = 'active') AS "activeConsentGrants",
        (SELECT count(*)::int FROM media_assets WHERE owner_user_id = cast(:userId as uuid)) AS "totalMedia"
      """, nativeQuery = true)
  Map<String, Object> dashboardMetrics(@Param("userId") String userId);

  @Query(value = """
      SELECT id, title, category, status::text, location_text AS "locationText", created_at AS "createdAt"
      FROM jobs WHERE seeker_user_id = cast(:userId as uuid) ORDER BY created_at DESC LIMIT 3
      """, nativeQuery = true)
  List<Map<String, Object>> recentJobs(@Param("userId") String userId);

  @Modifying
  @Query(value = """
      UPDATE users SET email_masked = :emailMasked, phone_masked = :phoneMasked, updated_at = now()
      WHERE id = cast(:userId as uuid)
      """, nativeQuery = true)
  void updateMaskedContact(@Param("userId") String userId, @Param("emailMasked") String emailMasked, @Param("phoneMasked") String phoneMasked);

  @Modifying
  @Query(value = """
      INSERT INTO profiles (user_id, first_name, last_name, service_categories, pii_email_encrypted, pii_phone_encrypted)
      VALUES (cast(:userId as uuid), :firstName, :lastName, cast(:serviceCategories as text[]), :encryptedEmail, :encryptedPhone)
      ON CONFLICT (user_id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
        service_categories = EXCLUDED.service_categories,
        pii_email_encrypted = coalesce(EXCLUDED.pii_email_encrypted, profiles.pii_email_encrypted),
        pii_phone_encrypted = coalesce(EXCLUDED.pii_phone_encrypted, profiles.pii_phone_encrypted), updated_at = now()
      """, nativeQuery = true)
  void upsertRegistrationProfile(@Param("userId") String userId, @Param("firstName") String firstName, @Param("lastName") String lastName,
      @Param("serviceCategories") String[] serviceCategories, @Param("encryptedEmail") byte[] encryptedEmail, @Param("encryptedPhone") byte[] encryptedPhone);

  @Query(value = """
      SELECT pii_email_encrypted, pii_phone_encrypted, pii_alternate_phone_encrypted, pii_full_address_encrypted
      FROM profiles WHERE user_id = cast(:userId as uuid)
      """, nativeQuery = true)
  Map<String, Object> existingPii(@Param("userId") String userId);

  @Modifying
  @Query(value = """
      UPDATE profiles SET first_name = coalesce(:firstName, first_name), last_name = coalesce(:lastName, last_name),
        city = coalesce(:city, city), area = coalesce(:area, area),
        service_categories = coalesce(cast(:serviceCategories as text[]), service_categories),
        pii_email_encrypted = :encryptedEmail, pii_phone_encrypted = :encryptedPhone,
        pii_alternate_phone_encrypted = :encryptedAlternatePhone, pii_full_address_encrypted = :encryptedFullAddress,
        updated_at = now()
      WHERE user_id = cast(:userId as uuid)
      """, nativeQuery = true)
  void updateProfile(@Param("userId") String userId, @Param("firstName") String firstName, @Param("lastName") String lastName,
      @Param("city") String city, @Param("area") String area, @Param("serviceCategories") String[] serviceCategories,
      @Param("encryptedEmail") byte[] encryptedEmail, @Param("encryptedPhone") byte[] encryptedPhone,
      @Param("encryptedAlternatePhone") byte[] encryptedAlternatePhone, @Param("encryptedFullAddress") byte[] encryptedFullAddress);

  @Modifying
  @Query(value = "UPDATE users SET verified = :verified, updated_at = now() WHERE id = cast(:userId as uuid)", nativeQuery = true)
  void setUserVerified(@Param("userId") String userId, @Param("verified") boolean verified);

  @Query(value = """
      SELECT u.id AS user_id, u.username, p.first_name, p.last_name,
             trim(concat(p.first_name, ' ', coalesce(p.last_name, ''))) AS display_name,
             p.city, p.area, p.service_categories, p.rating_average, p.rating_count,
             u.email_masked, u.phone_masked, u.verified, p.pii_email_encrypted, p.pii_phone_encrypted,
             p.pii_alternate_phone_encrypted, p.pii_full_address_encrypted
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = cast(:userId as uuid)
      """, nativeQuery = true)
  Map<String, Object> profileRow(@Param("userId") String userId);

  @Query(value = "SELECT id::text FROM users WHERE lower(username) = lower(:identifier) LIMIT 1", nativeQuery = true)
  String findInternalUserIdByUsername(@Param("identifier") String identifier);
}
