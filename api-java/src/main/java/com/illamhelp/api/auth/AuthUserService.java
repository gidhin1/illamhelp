package com.illamhelp.api.auth;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthUserService {
  private final UserRepository userRepository;

  public AuthUserService(UserRepository userRepository) {
    this.userRepository = userRepository;
  }

  @Transactional
  public void syncUserFromToken(String userId, List<String> roles, String publicUserId) {
    String role = roles.contains("admin") ? "admin" : roles.contains("support") ? "support" : "both";
    String username = normalizePublicUserId(publicUserId, userId);
    userRepository.upsertFromToken(userId, role, username);
  }

  public Optional<String> getUsernameByUserId(String userId) {
    return userRepository.findById(UUID.fromString(userId)).map(UserEntity::getUsername);
  }

  private String normalizePublicUserId(String value, String userId) {
    String raw = value == null ? "" : value.trim().toLowerCase();
    if (raw.length() >= 3 && raw.length() <= 40 && raw.matches("^[a-z0-9._-]+$")) {
      return raw;
    }
    return "member_" + userId.replace("-", "").substring(0, Math.min(10, userId.length()));
  }
}
