package com.illamhelp.api.profiles;

import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.common.JsonMaps;
import com.illamhelp.api.config.AppProperties;
import com.illamhelp.api.consent.ConsentService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfilesService {
  private static final int GCM_IV_LENGTH_BYTES = 12;
  private static final int GCM_AUTH_TAG_LENGTH_BITS = 128;

  private final ProfileRepository profileRepository;
  private final ConsentService consentService;
  private final SecretKeySpec piiEncryptionKey;
  private final SecureRandom secureRandom = new SecureRandom();

  public ProfilesService(ProfileRepository profileRepository, ConsentService consentService, AppProperties properties) {
    this.profileRepository = profileRepository;
    this.consentService = consentService;
    String keyMaterial = properties.profilePiiEncryptionKey();
    if (keyMaterial == null || keyMaterial.trim().length() < 16) {
      throw new IllegalStateException("PROFILE_PII_ENCRYPTION_KEY is required and must be at least 16 characters");
    }
    try {
      this.piiEncryptionKey = new SecretKeySpec(
          MessageDigest.getInstance("SHA-256").digest(keyMaterial.getBytes(StandardCharsets.UTF_8)),
          "AES");
    } catch (Exception exception) {
      throw new IllegalStateException("Unable to configure profile PII encryption", exception);
    }
  }

  public Map<String, Object> getOwnProfile(String userId) {
    return profile(userId, Map.of("email", true, "phone", true, "alternatePhone", true, "fullAddress", true));
  }

  public Map<String, Object> getProfileForViewer(String targetUserId, String viewerUserId) {
    targetUserId = resolveInternalUserId(targetUserId);
    if (targetUserId.equals(viewerUserId)) {
      return getOwnProfile(targetUserId);
    }
    Map<String, Boolean> visibility = new LinkedHashMap<>();
    visibility.put("email", canView(targetUserId, viewerUserId, "email"));
    visibility.put("phone", canView(targetUserId, viewerUserId, "phone"));
    visibility.put("alternatePhone", canView(targetUserId, viewerUserId, "alternate_phone"));
    visibility.put("fullAddress", canView(targetUserId, viewerUserId, "full_address"));
    return profile(targetUserId, visibility);
  }

  public Map<String, Object> dashboard(String userId) {
    Map<String, Object> profile = getOwnProfile(userId);
    Map<String, Object> counts = profileRepository.dashboardMetrics(userId);
    List<Map<String, Object>> recentJobs = profileRepository.recentJobs(userId);
    return Map.of("profile", profile, "metrics", counts, "recentJobs", recentJobs);
  }

  @Transactional
  public void upsertFromRegistration(String userId, String firstName, String lastName, String email, String phone) {
    profileRepository.updateMaskedContact(userId, email == null || email.isBlank() ? null : maskEmail(email.trim().toLowerCase()),
        phone == null || phone.isBlank() ? null : maskPhone(phone.trim()));
    profileRepository.upsertRegistrationProfile(userId, firstName == null ? "" : firstName.trim(),
        lastName == null || lastName.isBlank() ? null : lastName.trim(),
        new String[]{"housekeeping", "cooking", "elder_care", "child_care"},
        encryptOptionalPii(email == null ? null : email.trim().toLowerCase()), encryptOptionalPii(phone));
  }

  @Transactional
  public Map<String, Object> updateOwnProfile(String userId, UpdateProfileRequest body) {
    Map<String, Object> existing = profileRepository.existingPii(userId);
    String email = body.email() == null ? decryptOptionalPii((byte[]) existing.get("pii_email_encrypted")) : body.email().trim().toLowerCase();
    String phone = body.phone() == null ? decryptOptionalPii((byte[]) existing.get("pii_phone_encrypted")) : body.phone().trim();
    String alternatePhone = body.alternatePhone() == null
        ? decryptOptionalPii((byte[]) existing.get("pii_alternate_phone_encrypted"))
        : body.alternatePhone().trim();
    String fullAddress = body.fullAddress() == null
        ? decryptOptionalPii((byte[]) existing.get("pii_full_address_encrypted"))
        : body.fullAddress().trim();
    profileRepository.updateProfile(userId, body.firstName(), body.lastName(), body.city(), body.area(), body.serviceCategories(),
        encryptOptionalPii(email), encryptOptionalPii(phone), encryptOptionalPii(alternatePhone), encryptOptionalPii(fullAddress));
    profileRepository.updateMaskedContact(userId, email == null || email.isBlank() ? null : maskEmail(email),
        phone == null || phone.isBlank() ? null : maskPhone(phone));
    return getOwnProfile(userId);
  }

  @Transactional
  public Map<String, Object> setVerified(String userId, boolean verified) {
    String internalUserId = resolveInternalUserId(userId);
    profileRepository.setUserVerified(internalUserId, verified);
    return getOwnProfile(internalUserId);
  }

  private Map<String, Object> profile(String userId, Map<String, Boolean> visibility) {
    Map<String, Object> row = profileRepository.profileRow(userId);
    if (JsonMaps.string(row, "first_name") == null) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Profile not found");
    }
    Map<String, Object> contact = new LinkedHashMap<>();
    contact.put("email", visible(visibility, "email") ? decryptOptionalPii((byte[]) row.get("pii_email_encrypted")) : null);
    contact.put("phone", visible(visibility, "phone") ? decryptOptionalPii((byte[]) row.get("pii_phone_encrypted")) : null);
    contact.put("alternatePhone", visible(visibility, "alternatePhone") ? decryptOptionalPii((byte[]) row.get("pii_alternate_phone_encrypted")) : null);
    contact.put("fullAddress", visible(visibility, "fullAddress") ? decryptOptionalPii((byte[]) row.get("pii_full_address_encrypted")) : null);
    contact.put("emailMasked", row.get("email_masked"));
    contact.put("phoneMasked", row.get("phone_masked"));

    Map<String, Object> profile = new LinkedHashMap<>();
    profile.put("userId", JsonMaps.string(row, "username"));
    profile.put("firstName", JsonMaps.string(row, "first_name"));
    profile.put("lastName", JsonMaps.string(row, "last_name"));
    profile.put("displayName", JsonMaps.string(row, "display_name"));
    profile.put("city", JsonMaps.string(row, "city"));
    profile.put("area", JsonMaps.string(row, "area"));
    profile.put("serviceCategories", row.get("service_categories"));
    profile.put("ratingAverage", row.get("rating_average"));
    profile.put("ratingCount", row.get("rating_count"));
    profile.put("verified", row.get("verified"));
    profile.put("contact", contact);
    profile.put("visibility", visibility);
    return profile;
  }

  private String resolveInternalUserId(String identifier) {
    if (identifier != null && identifier.matches("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")) {
      return identifier;
    }
    return profileRepository.findInternalUserIdByUsername(identifier);
  }

  private boolean canView(String ownerUserId, String viewerUserId, String field) {
    return Boolean.TRUE.equals(consentService.canView(
        viewerUserId, Map.of("ownerUserId", ownerUserId, "field", field)).get("allowed"));
  }

  private boolean visible(Map<String, Boolean> visibility, String field) {
    return Boolean.TRUE.equals(visibility.get(field));
  }

  private byte[] encryptOptionalPii(String value) {
    if (value == null || value.trim().isEmpty()) {
      return null;
    }
    try {
      byte[] iv = new byte[GCM_IV_LENGTH_BYTES];
      secureRandom.nextBytes(iv);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, piiEncryptionKey, new GCMParameterSpec(GCM_AUTH_TAG_LENGTH_BITS, iv));
      byte[] encryptedAndTag = cipher.doFinal(value.trim().getBytes(StandardCharsets.UTF_8));
      int ciphertextLength = encryptedAndTag.length - GCM_AUTH_TAG_LENGTH_BITS / 8;
      byte[] ciphertext = java.util.Arrays.copyOfRange(encryptedAndTag, 0, ciphertextLength);
      byte[] tag = java.util.Arrays.copyOfRange(encryptedAndTag, ciphertextLength, encryptedAndTag.length);
      Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
      return ("v1:" + encoder.encodeToString(iv) + ":" + encoder.encodeToString(ciphertext) + ":" + encoder.encodeToString(tag))
          .getBytes(StandardCharsets.UTF_8);
    } catch (Exception exception) {
      throw new IllegalStateException("Unable to encrypt profile contact field", exception);
    }
  }

  private String decryptOptionalPii(byte[] encrypted) {
    if (encrypted == null || encrypted.length == 0) {
      return null;
    }
    String value = new String(encrypted, StandardCharsets.UTF_8);
    if (!value.startsWith("v1:")) {
      return value;
    }
    String[] parts = value.split(":");
    if (parts.length != 4) {
      return null;
    }
    try {
      Base64.Decoder decoder = Base64.getUrlDecoder();
      byte[] iv = decoder.decode(parts[1]);
      byte[] ciphertext = decoder.decode(parts[2]);
      byte[] tag = decoder.decode(parts[3]);
      byte[] encryptedAndTag = new byte[ciphertext.length + tag.length];
      System.arraycopy(ciphertext, 0, encryptedAndTag, 0, ciphertext.length);
      System.arraycopy(tag, 0, encryptedAndTag, ciphertext.length, tag.length);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, piiEncryptionKey, new GCMParameterSpec(GCM_AUTH_TAG_LENGTH_BITS, iv));
      return new String(cipher.doFinal(encryptedAndTag), StandardCharsets.UTF_8).trim();
    } catch (Exception exception) {
      return null;
    }
  }

  private String maskEmail(String email) {
    int at = email.indexOf('@');
    if (at <= 1) {
      return "***" + (at >= 0 ? email.substring(at) : "");
    }
    return email.charAt(0) + "***" + email.substring(at);
  }

  private String maskPhone(String phone) {
    String digits = phone.replaceAll("\\D", "");
    if (digits.length() <= 4) {
      return "****";
    }
    return "****" + digits.substring(digits.length() - 4);
  }

  public record UpdateProfileRequest(
      @Size(min = 2, max = 80) String firstName,
      @Size(max = 80) String lastName,
      @Size(max = 80) String city,
      @Size(max = 80) String area,
      @Size(max = 20) String[] serviceCategories,
      @Email @Size(max = 120) String email,
      @Size(min = 8, max = 20) @Pattern(regexp = "^[+0-9][0-9\\s-]{7,19}$") String phone,
      @Size(min = 8, max = 20) @Pattern(regexp = "^[+0-9][0-9\\s-]{7,19}$") String alternatePhone,
      @Size(min = 5, max = 240) String fullAddress
  ) {
  }
}
