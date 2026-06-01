package com.illamhelp.api.profiles;

import com.illamhelp.api.common.ApiException;
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

  public ProfileRecord getOwnProfile(String userId) {
    return profile(userId, Map.of("email", true, "phone", true, "alternatePhone", true, "fullAddress", true));
  }

  public ProfileRecord getProfileForViewer(String targetUserId, String viewerUserId) {
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

  public DashboardResponse dashboard(String userId) {
    ProfileRecord profile = getOwnProfile(userId);
    ProfileRepository.DashboardMetricsRow counts = profileRepository.dashboardMetrics(userId);
    List<RecentJobRecord> recentJobs = profileRepository.recentJobs(userId).stream()
        .map(this::toRecentJobRecord)
        .toList();
    DashboardMetrics metrics = counts == null
        ? new DashboardMetrics(0, 0, 0, 0, 0, 0)
        : new DashboardMetrics(
            zeroIfNull(counts.getTotalJobs()),
            zeroIfNull(counts.getTotalConnections()),
            zeroIfNull(counts.getPendingConnections()),
            zeroIfNull(counts.getConsentRequests()),
            zeroIfNull(counts.getActiveConsentGrants()),
            zeroIfNull(counts.getTotalMedia()));
    return new DashboardResponse(profile, metrics, recentJobs);
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
  public ProfileRecord updateOwnProfile(String userId, UpdateProfileRequest body) {
    ProfileRepository.ExistingPiiRow existing = profileRepository.existingPii(userId);
    String email = body.email() == null ? decryptOptionalPii(existing == null ? null : existing.getPiiEmailEncrypted()) : body.email().trim().toLowerCase();
    String phone = body.phone() == null ? decryptOptionalPii(existing == null ? null : existing.getPiiPhoneEncrypted()) : body.phone().trim();
    String alternatePhone = body.alternatePhone() == null
        ? decryptOptionalPii(existing == null ? null : existing.getPiiAlternatePhoneEncrypted())
        : body.alternatePhone().trim();
    String fullAddress = body.fullAddress() == null
        ? decryptOptionalPii(existing == null ? null : existing.getPiiFullAddressEncrypted())
        : body.fullAddress().trim();
    profileRepository.updateProfile(userId, body.firstName(), body.lastName(), body.city(), body.area(), body.serviceCategories(),
        encryptOptionalPii(email), encryptOptionalPii(phone), encryptOptionalPii(alternatePhone), encryptOptionalPii(fullAddress));
    profileRepository.updateMaskedContact(userId, email == null || email.isBlank() ? null : maskEmail(email),
        phone == null || phone.isBlank() ? null : maskPhone(phone));
    return getOwnProfile(userId);
  }

  @Transactional
  public ProfileRecord setVerified(String userId, boolean verified) {
    String internalUserId = resolveInternalUserId(userId);
    profileRepository.setUserVerified(internalUserId, verified);
    return getOwnProfile(internalUserId);
  }

  private ProfileRecord profile(String userId, Map<String, Boolean> visibility) {
    ProfileRepository.ProfileRow row = profileRepository.profileRow(userId);
    if (row == null || row.getFirstName() == null) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Profile not found");
    }
    ProfileContact contact = new ProfileContact(
        visible(visibility, "email") ? decryptOptionalPii(row.getPiiEmailEncrypted()) : null,
        visible(visibility, "phone") ? decryptOptionalPii(row.getPiiPhoneEncrypted()) : null,
        visible(visibility, "alternatePhone") ? decryptOptionalPii(row.getPiiAlternatePhoneEncrypted()) : null,
        visible(visibility, "fullAddress") ? decryptOptionalPii(row.getPiiFullAddressEncrypted()) : null,
        row.getEmailMasked(),
        row.getPhoneMasked());
    return new ProfileRecord(
        row.getUsername(),
        row.getFirstName(),
        row.getLastName(),
        row.getDisplayName(),
        row.getCity(),
        row.getArea(),
        row.getServiceCategories(),
        row.getRatingAverage(),
        row.getRatingCount(),
        row.getVerified(),
        contact,
        visibility);
  }

  private String resolveInternalUserId(String identifier) {
    if (identifier != null && identifier.matches("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")) {
      return identifier;
    }
    return profileRepository.findInternalUserIdByUsername(identifier);
  }

  private boolean canView(String ownerUserId, String viewerUserId, String field) {
    return consentService.canView(viewerUserId, new ConsentService.CanViewInput(ownerUserId, field)).allowed();
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

  private RecentJobRecord toRecentJobRecord(ProfileRepository.RecentJobRow row) {
    return new RecentJobRecord(
        row.getId(),
        row.getTitle(),
        row.getCategory(),
        row.getStatus(),
        row.getLocationText(),
        row.getCreatedAt());
  }

  private int zeroIfNull(Integer value) {
    return value == null ? 0 : value;
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

  public record ProfileContact(String email, String phone, String alternatePhone, String fullAddress,
      String emailMasked, String phoneMasked) {
  }

  public record ProfileRecord(String userId, String firstName, String lastName, String displayName, String city,
      String area, String[] serviceCategories, Double ratingAverage, Integer ratingCount, Boolean verified,
      ProfileContact contact, Map<String, Boolean> visibility) {
  }

  public record DashboardMetrics(int totalJobs, int totalConnections, int pendingConnections, int consentRequests,
      int activeConsentGrants, int totalMedia) {
  }

  public record RecentJobRecord(String id, String title, String category, String status, String locationText,
      String createdAt) {
  }

  public record DashboardResponse(ProfileRecord profile, DashboardMetrics metrics, List<RecentJobRecord> recentJobs) {
  }
}
