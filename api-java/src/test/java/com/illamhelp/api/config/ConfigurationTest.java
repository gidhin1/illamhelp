package com.illamhelp.api.config;

import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Method;
import java.util.Collection;
import java.util.Map;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.config.annotation.CorsRegistration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.PathMatchConfigurer;

class ConfigurationTest {
  @Test
  void exposesClientBeansAndPropertyRecord() {
    ClientConfig config = new ClientConfig();

    assertThat(config.objectMapper()).isNotNull();
    assertThat(config.restClientBuilder()).isNotNull();
    assertThat(properties().apiPrefix()).isEqualTo("/api/v1");
  }

  @Test
  @SuppressWarnings("unchecked")
  void extractsOnlyApplicationClientRolesForSecurity() throws Exception {
    SecurityConfig config = new SecurityConfig(properties());
    Method method = SecurityConfig.class.getDeclaredMethod("authorities", Jwt.class);
    method.setAccessible(true);
    Jwt jwt = Jwt.withTokenValue("t").header("alg", "none").subject("user")
        .claim("realm_access", Map.of("roles", java.util.List.of("support")))
        .claim("resource_access", Map.of(
            "unrelated-client", Map.of("roles", java.util.List.of("admin")),
            "illamhelp-api", Map.of("roles", java.util.List.of("support")))).build();

    Collection<GrantedAuthority> authorities = (Collection<GrantedAuthority>) method.invoke(config, jwt);

    assertThat(authorities).extracting(GrantedAuthority::getAuthority).containsExactly("ROLE_support");
  }

  @Test
  void webConfigAppliesApiPrefixAndCorsOrigins() {
    WebConfig config = new WebConfig(properties());
    PathMatchConfigurer pathMatch = mock(PathMatchConfigurer.class);
    ArgumentCaptor<Predicate<Class<?>>> predicate = ArgumentCaptor.forClass(Predicate.class);
    config.configurePathMatch(pathMatch);
    verify(pathMatch).addPathPrefix(org.mockito.ArgumentMatchers.eq("/api/v1"), predicate.capture());
    assertThat(predicate.getValue().test(com.illamhelp.api.health.HealthController.class)).isTrue();
    assertThat(predicate.getValue().test(WebConfig.class)).isFalse();

    CorsRegistry registry = mock(CorsRegistry.class);
    CorsRegistration registration = mock(CorsRegistration.class);
    when(registry.addMapping("/**")).thenReturn(registration);
    when(registration.allowedOrigins(org.mockito.ArgumentMatchers.any(String[].class))).thenReturn(registration);
    when(registration.allowedMethods(org.mockito.ArgumentMatchers.any(String[].class))).thenReturn(registration);
    when(registration.allowedHeaders(org.mockito.ArgumentMatchers.any(String[].class))).thenReturn(registration);
    config.addCorsMappings(registry);
    verify(registration).allowedOrigins("http://localhost:3000", "http://localhost:3001");
    verify(registration).allowCredentials(false);
  }

  @Test
  void guardRejectsUnknownWriteOriginAndRateLimitsKnownClient() throws Exception {
    RequestGuardFilter filter = new RequestGuardFilter(properties());
    HttpServletResponse rejected = responseWithWriter();
    HttpServletRequest foreign = request("POST", "/api/v1/auth/login", "https://bad.site");
    FilterChain chain = mock(FilterChain.class);

    filter.doFilterInternal(foreign, rejected, chain);

    verify(rejected).setStatus(403);

    HttpServletRequest first = request("POST", "/api/v1/auth/login", "http://localhost:3000");
    HttpServletRequest second = request("POST", "/api/v1/auth/login", "http://localhost:3000");
    HttpServletResponse accepted = responseWithWriter();
    HttpServletResponse limited = responseWithWriter();
    filter.doFilterInternal(first, accepted, chain);
    filter.doFilterInternal(second, limited, chain);
    verify(chain).doFilter(first, accepted);
    verify(limited).setStatus(429);
  }

  @Test
  void guardIgnoresForwardedAddressUnlessDirectPeerIsTrustedProxy() {
    HttpServletRequest untrusted = request("POST", "/api/v1/auth/login", "http://localhost:3000");
    when(untrusted.getRemoteAddr()).thenReturn("198.51.100.10");
    when(untrusted.getHeader("X-Forwarded-For")).thenReturn("203.0.113.22");
    assertThat(new RequestGuardFilter(properties()).clientIp(untrusted)).isEqualTo("198.51.100.10");

    HttpServletRequest trusted = request("POST", "/api/v1/auth/login", "http://localhost:3000");
    when(trusted.getRemoteAddr()).thenReturn("10.5.4.3");
    when(trusted.getHeader("X-Forwarded-For")).thenReturn("203.0.113.22, 10.5.4.3");
    assertThat(new RequestGuardFilter(properties("10.0.0.0/8")).clientIp(trusted)).isEqualTo("203.0.113.22");
  }

  @Test
  void guardUsesDistributedStoreWhenEnabled() throws Exception {
    AppProperties enabled = new AppProperties(
        properties().apiPrefix(), properties().corsOrigins(), properties().strictOriginCheck(), "",
        true, properties().profilePiiEncryptionKey(), properties().authRateLimitWindowMs(), properties().authRateLimitMax(),
        properties().jobsWriteRateLimitWindowMs(), properties().jobsWriteRateLimitMax(),
        properties().jobAssignmentRevokeWindowMinutes(), properties().connectionsWriteRateLimitWindowMs(),
        properties().connectionsWriteRateLimitMax(), properties().consentWriteRateLimitWindowMs(),
        properties().consentWriteRateLimitMax(), properties().mediaWriteRateLimitWindowMs(),
        properties().mediaWriteRateLimitMax(), properties().searchRateLimitWindowMs(), properties().searchRateLimitMax(),
        properties().opaUrl(), properties().keycloakUrl(), properties().keycloakRealm(), properties().keycloakClientId(),
        properties().keycloakClientSecret(), properties().keycloakAdminRealm(), properties().keycloakAdminClientId(),
        properties().keycloakAdminUsername(), properties().keycloakAdminPassword(), properties().minioEndpoint(),
        properties().minioAccessKey(), properties().minioSecretKey(), properties().minioRegion(),
        properties().minioQuarantineBucket(), properties().minioApprovedBucket(), properties().mediaMaxImageBytes(),
        properties().mediaMaxVideoBytes(), properties().mediaAllowedImageTypes(), properties().mediaAllowedVideoTypes(),
        properties().openSearchEnabled(), properties().openSearchUrl(), properties().openSearchUsername(),
        properties().openSearchPassword(), properties().openSearchIndexJobs(), properties().openSearchTimeoutMs());
    RedisRateLimitStore store = mock(RedisRateLimitStore.class);
    when(store.consume("auth-login:127.0.0.1", 60000, 1)).thenReturn(false);
    RequestGuardFilter filter = new RequestGuardFilter(enabled, store);
    HttpServletResponse response = responseWithWriter();
    FilterChain chain = mock(FilterChain.class);

    filter.doFilterInternal(request("POST", "/api/v1/auth/login", "http://localhost:3000"), response, chain);

    verify(store).consume("auth-login:127.0.0.1", 60000, 1);
    verify(response).setStatus(429);
    verify(chain, never()).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
  }

  private HttpServletRequest request(String method, String uri, String origin) {
    HttpServletRequest request = mock(HttpServletRequest.class);
    when(request.getMethod()).thenReturn(method);
    when(request.getRequestURI()).thenReturn(uri);
    when(request.getHeader("Origin")).thenReturn(origin);
    when(request.getRemoteAddr()).thenReturn("127.0.0.1");
    return request;
  }

  private HttpServletResponse responseWithWriter() throws Exception {
    HttpServletResponse response = mock(HttpServletResponse.class);
    when(response.getWriter()).thenReturn(new PrintWriter(new StringWriter()));
    return response;
  }
}
