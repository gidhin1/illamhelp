package com.illamhelp.api.notifications;

import com.illamhelp.api.common.CurrentUser;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class NotificationController {
  private final NotificationService service;

  public NotificationController(NotificationService service) {
    this.service = service;
  }

  @GetMapping("/notifications")
  public Map<String, Object> list(
      @AuthenticationPrincipal Jwt jwt,
      @RequestParam(required = false, defaultValue = "false") boolean unreadOnly,
      @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) String cursor) {
    return service.list(CurrentUser.fromJwt(jwt).userId(), unreadOnly, limit, cursor);
  }

  @GetMapping("/notifications/unread-count")
  public Map<String, Integer> unreadCount(@AuthenticationPrincipal Jwt jwt) {
    return service.unreadCount(CurrentUser.fromJwt(jwt).userId());
  }

  @PatchMapping("/notifications/{id}/read")
  public Map<String, Object> markRead(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return service.markRead(CurrentUser.fromJwt(jwt).userId(), id);
  }

  @PatchMapping("/notifications/read-all")
  public Map<String, Integer> markAllRead(@AuthenticationPrincipal Jwt jwt) {
    return service.markAllRead(CurrentUser.fromJwt(jwt).userId());
  }
}
