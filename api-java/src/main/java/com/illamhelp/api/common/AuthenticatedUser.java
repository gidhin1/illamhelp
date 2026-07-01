package com.illamhelp.api.common;

import java.util.List;

public record AuthenticatedUser(
    String userId,
    String publicUserId,
    String analyticsUserId,
    List<String> roles,
    String userType,
    String tokenSubject
) {
}
