package com.illamhelp.api.media;

import com.illamhelp.api.common.AuthenticatedUser;
import com.illamhelp.api.common.CurrentUser;
import io.grpc.Status;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

final class GrpcAuth {
  private GrpcAuth() {
  }

  static AuthenticatedUser currentUser() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || !(authentication.getPrincipal() instanceof Jwt jwt)) {
      throw Status.UNAUTHENTICATED.withDescription("Authentication required").asRuntimeException();
    }
    return CurrentUser.fromJwt(jwt);
  }

  static void requireStaff(AuthenticatedUser user) {
    if (!user.roles().contains("admin") && !user.roles().contains("support")) {
      throw Status.PERMISSION_DENIED.withDescription("Admin or support role required").asRuntimeException();
    }
  }
}
