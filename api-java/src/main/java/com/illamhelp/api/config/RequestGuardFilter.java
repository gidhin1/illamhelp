package com.illamhelp.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestGuardFilter extends OncePerRequestFilter {
  private static final Logger LOGGER = LoggerFactory.getLogger(RequestGuardFilter.class);
  private final AppProperties properties;
  private final RedisRateLimitStore redisRateLimitStore;
  private final List<String> allowedOrigins;
  private final List<CidrBlock> trustedProxyCidrs;
  private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
  private final AtomicLong nextBucketCleanupAt = new AtomicLong();
  private final List<Rule> rules;

  @Autowired
  public RequestGuardFilter(AppProperties properties, ObjectProvider<RedisRateLimitStore> redisRateLimitStore) {
    this(properties, redisRateLimitStore.getIfAvailable());
  }

  RequestGuardFilter(AppProperties properties) {
    this(properties, (RedisRateLimitStore) null);
  }

  RequestGuardFilter(AppProperties properties, RedisRateLimitStore redisRateLimitStore) {
    this.properties = properties;
    this.redisRateLimitStore = redisRateLimitStore;
    this.allowedOrigins = Arrays.stream(properties.corsOrigins().split(","))
        .map(String::trim)
        .filter(value -> !value.isBlank())
        .toList();
    this.trustedProxyCidrs = Arrays.stream(properties.trustedProxyCidrs().split(","))
        .map(String::trim)
        .filter(value -> !value.isBlank())
        .map(CidrBlock::parse)
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
    return rule.id() + ":" + clientIp(request);
  }

  String clientIp(HttpServletRequest request) {
    String remoteAddress = request.getRemoteAddr();
    if (trustedProxyCidrs.stream().noneMatch(cidr -> cidr.contains(remoteAddress))) {
      return remoteAddress;
    }
    String forwarded = request.getHeader("X-Forwarded-For");
    return forwarded == null || forwarded.isBlank() ? remoteAddress : forwarded.split(",")[0].trim();
  }

  private boolean consume(Rule rule, String key) {
    if (properties.redisRateLimitEnabled() && redisRateLimitStore != null) {
      try {
        return redisRateLimitStore.consume(key, rule.windowMs(), rule.max());
      } catch (RuntimeException exception) {
        LOGGER.warn("Redis rate limiter unavailable; using local bounded fallback: {}", exception.getMessage());
      }
    }
    long now = Instant.now().toEpochMilli();
    cleanupExpiredBuckets(now, Math.max(60_000L, rule.windowMs()));
    Bucket bucket = buckets.compute(key, (ignored, existing) -> {
      if (existing == null || now >= existing.resetAt()) {
        return new Bucket(now + rule.windowMs(), 1);
      }
      return new Bucket(existing.resetAt(), existing.count() + 1);
    });
    return bucket.count() <= rule.max();
  }

  private void cleanupExpiredBuckets(long now, long cleanupIntervalMs) {
    long scheduled = nextBucketCleanupAt.get();
    if (now < scheduled || !nextBucketCleanupAt.compareAndSet(scheduled, now + cleanupIntervalMs)) {
      return;
    }
    buckets.entrySet().removeIf(entry -> now >= entry.getValue().resetAt());
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

  private record CidrBlock(byte[] network, int prefixBits) {
    static CidrBlock parse(String value) {
      String[] parts = value.split("/", 2);
      try {
        byte[] address = InetAddress.getByName(parts[0]).getAddress();
        int bits = parts.length == 1 ? address.length * 8 : Integer.parseInt(parts[1]);
        if (bits < 0 || bits > address.length * 8) {
          throw new IllegalArgumentException("Invalid trusted proxy CIDR prefix: " + value);
        }
        return new CidrBlock(address, bits);
      } catch (UnknownHostException | NumberFormatException exception) {
        throw new IllegalArgumentException("Invalid trusted proxy CIDR: " + value, exception);
      }
    }

    boolean contains(String value) {
      try {
        byte[] candidate = InetAddress.getByName(value).getAddress();
        if (candidate.length != network.length) {
          return false;
        }
        int completeBytes = prefixBits / 8;
        int remainingBits = prefixBits % 8;
        for (int index = 0; index < completeBytes; index++) {
          if (candidate[index] != network[index]) {
            return false;
          }
        }
        if (remainingBits == 0) {
          return true;
        }
        int mask = 0xff << (8 - remainingBits);
        return (candidate[completeBytes] & mask) == (network[completeBytes] & mask);
      } catch (UnknownHostException exception) {
        return false;
      }
    }
  }
}
