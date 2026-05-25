package com.illamhelp.api.common;

import java.util.ArrayList;
import java.util.List;
import org.springframework.security.oauth2.jwt.Jwt;

public final class CurrentUser {
  private CurrentUser() {
  }

  public static AuthenticatedUser fromJwt(Jwt jwt) {
    List<String> roles = new ArrayList<>();
    Object realmAccess = jwt.getClaim("realm_access");
    if (realmAccess instanceof java.util.Map<?, ?> map && map.get("roles") instanceof List<?> values) {
      roles.addAll(values.stream().map(String::valueOf).toList());
    }
    if (roles.isEmpty()) {
      roles.add("both");
    }
    String publicUserId = firstNonBlank(
        jwt.getClaimAsString("preferred_username"),
        jwt.getClaimAsString("username"),
        "member_" + jwt.getSubject().replace("-", "").substring(0, Math.min(10, jwt.getSubject().length())));
    return new AuthenticatedUser(jwt.getSubject(), publicUserId, roles, resolveUserType(roles), jwt.getSubject());
  }

  private static String resolveUserType(List<String> roles) {
    if (roles.contains("provider") && !roles.contains("seeker")) {
      return "provider";
    }
    if (roles.contains("seeker") && !roles.contains("provider")) {
      return "seeker";
    }
    return "both";
  }

  private static String firstNonBlank(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value;
      }
    }
    return "member";
  }
}
