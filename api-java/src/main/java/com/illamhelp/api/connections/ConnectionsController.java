package com.illamhelp.api.connections;

import com.illamhelp.api.common.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ConnectionsController {
  private final ConnectionsService service;

  public ConnectionsController(ConnectionsService service) {
    this.service = service;
  }

  @GetMapping("/connections")
  public Map<String, Object> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) Integer limit, @RequestParam(required = false) Integer offset) {
    return service.list(CurrentUser.fromJwt(jwt).userId(), limit, offset);
  }

  @GetMapping("/connections/search")
  public List<Map<String, Object>> search(@AuthenticationPrincipal Jwt jwt,
      @Valid @ModelAttribute ConnectionSearchRequest request) {
    return service.search(CurrentUser.fromJwt(jwt).userId(), request.q(), request.limit());
  }

  @PostMapping("/connections/request")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> request(@AuthenticationPrincipal Jwt jwt,
      @Valid @RequestBody ConnectionRequest request) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("targetUserId", request.targetUserId());
    body.put("targetQuery", request.targetQuery());
    return service.request(CurrentUser.fromJwt(jwt).userId(), body);
  }

  @PostMapping("/connections/{id}/accept")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> accept(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return service.decide(id, CurrentUser.fromJwt(jwt).userId(), "accepted");
  }

  @PostMapping("/connections/{id}/decline")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> decline(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return service.decide(id, CurrentUser.fromJwt(jwt).userId(), "declined");
  }

  @PostMapping("/connections/{id}/block")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> block(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return service.decide(id, CurrentUser.fromJwt(jwt).userId(), "blocked");
  }

  public record ConnectionSearchRequest(@Size(max = 120) String q, @Min(1) @Max(20) Integer limit) {
  }

  public record ConnectionRequest(@Size(min = 3, max = 40) String targetUserId,
      @Size(min = 2, max = 120) String targetQuery) {
  }
}
