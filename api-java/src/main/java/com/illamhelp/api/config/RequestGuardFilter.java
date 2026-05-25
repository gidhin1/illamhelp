package com.illamhelp.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestGuardFilter extends OncePerRequestFilter {
  private final AppProperties properties;
  private final List<String> allowedOrigins;
  private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
  private final List<Rule> rules;

  public RequestGuardFilter(AppProperties properties) {
    this.properties = properties;
    this.allowedOrigins = Arrays.stream(properties.corsOrigins().split(","))
        .map(String::trim)
        .filter(value -> !value.isBlank())
        .toList();
    this.rules = List.of(
        new Rule("auth-login", "POST", Pattern.compile("^/api/v1/auth/login$"),
            properties.authRateLimitWindowMs(), properties.authRateLimitMax(),
            "Too many authentication attempts. Try again shortly."),
        new Rule("auth-register", "POST", Pattern.compile("^/api/v1/auth/register$"),
            properties.authRateLimitWindowMs(), properties.authRateLimitMax(),
            "Too many authentication attempts. Try again shortly."),
        new Rule("jobs-write", "POST", Pattern.compile("^/api/v1/jobs(?:$|/[^/]+/apply$|/[^/]+/booking/(?:start|complete|payment-done|payment-received|close|cancel)$|/applications/[^/]+/(?:accept|reject|withdraw)$)"),
            properties.jobsWriteRateLimitWindowMs(), properties.jobsWriteRateLimitMax(),
            "Too many job write operations. Please slow down and try again."),
        new Rule("connections-write", "POST", Pattern.compile("^/api/v1/connections/(?:request|[^/]+/(?:accept|decline|block))$"),
            properties.connectionsWriteRateLimitWindowMs(), properties.connectionsWriteRateLimitMax(),
            "Too many connection actions. Please try again shortly."),
        new Rule("consent-write", "POST", Pattern.compile("^/api/v1/consent/(?:request-access|[^/]+/(?:grant|revoke))$"),
            properties.consentWriteRateLimitWindowMs(), properties.consentWriteRateLimitMax(),
            "Too many consent actions. Please try again shortly."),
        new Rule("media-write", "POST", Pattern.compile("^/api/v1/media/(?:upload-ticket|[^/]+/complete)$"),
            properties.mediaWriteRateLimitWindowMs(), properties.mediaWriteRateLimitMax(),
            "Too many media upload actions. Please try again shortly."),
        new Rule("search-read", "GET", Pattern.compile("^/api/v1/(?:jobs/search|connections/search)$"),
            properties.searchRateLimitWindowMs(), properties.searchRateLimitMax(),
            "Too many search requests. Please try again shortly."),
        new Rule("media-public-read", "GET", Pattern.compile("^/api/v1/media/public/[^/]+$"),
            properties.searchRateLimitWindowMs(), properties.searchRateLimitMax(),
            "Too many media requests. Please try again shortly."));
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    if (!originAllowed(request)) {
      writeError(response, 403, "Origin is not allowed");
      return;
    }
    Rule rule = matchingRule(request);
    if (rule != null && !consume(rule, clientKey(request, rule))) {
      writeError(response, 429, rule.message());
      return;
    }
    filterChain.doFilter(request, response);
  }

  private boolean originAllowed(HttpServletRequest request) {
    if (!properties.strictOriginCheck()) {
      return true;
    }
    String method = request.getMethod();
    if (HttpMethod.GET.matches(method) || HttpMethod.HEAD.matches(method) || HttpMethod.OPTIONS.matches(method)) {
      return true;
    }
    String origin = request.getHeader("Origin");
    if (origin == null || origin.isBlank()) {
      return true;
    }
    return allowedOrigins.contains(origin);
  }

  private Rule matchingRule(HttpServletRequest request) {
    String method = request.getMethod();
    String path = request.getRequestURI();
    return rules.stream()
        .filter(rule -> rule.method().equals(method) && rule.pathPattern().matcher(path).matches())
        .findFirst()
        .orElse(null);
  }

  private String clientKey(HttpServletRequest request, Rule rule) {
    String forwarded = request.getHeader("X-Forwarded-For");
    String ip = forwarded == null || forwarded.isBlank()
        ? request.getRemoteAddr()
        : forwarded.split(",")[0].trim();
    return rule.id() + ":" + ip;
  }

  private boolean consume(Rule rule, String key) {
    long now = Instant.now().toEpochMilli();
    Bucket bucket = buckets.compute(key, (ignored, existing) -> {
      if (existing == null || now >= existing.resetAt()) {
        return new Bucket(now + rule.windowMs(), 1);
      }
      return new Bucket(existing.resetAt(), existing.count() + 1);
    });
    return bucket.count() <= rule.max();
  }

  private void writeError(HttpServletResponse response, int status, String message) throws IOException {
    response.setStatus(status);
    response.setContentType("application/json");
    response.getWriter().write("{\"statusCode\":" + status + ",\"message\":\"" + message + "\",\"error\":\"" +
        (status == 429 ? "Too Many Requests" : "Forbidden") + "\"}");
  }

  private record Rule(String id, String method, Pattern pathPattern, long windowMs, int max, String message) {
  }

  private record Bucket(long resetAt, int count) {
  }
}
