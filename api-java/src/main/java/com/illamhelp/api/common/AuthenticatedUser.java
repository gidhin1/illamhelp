package com.illamhelp.api.common;

import java.util.List;

public record AuthenticatedUser(
    String userId,
    String publicUserId,
    List<String> roles,
    String userType,
    String tokenSubject
) {
}
