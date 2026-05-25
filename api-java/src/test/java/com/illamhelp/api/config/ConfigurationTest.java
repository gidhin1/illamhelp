package com.illamhelp.api.config;

import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
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
  void extractsRealmAndResourceRolesForSecurity() throws Exception {
    SecurityConfig config = new SecurityConfig();
    Method method = SecurityConfig.class.getDeclaredMethod("authorities", Jwt.class);
    method.setAccessible(true);
    Jwt jwt = Jwt.withTokenValue("t").header("alg", "none").subject("user")
        .claim("realm_access", Map.of("roles", java.util.List.of("support")))
        .claim("resource_access", Map.of("client", Map.of("roles", java.util.List.of("admin")))).build();

    Collection<GrantedAuthority> authorities = (Collection<GrantedAuthority>) method.invoke(config, jwt);

    assertThat(authorities).extracting(GrantedAuthority::getAuthority).containsExactlyInAnyOrder("ROLE_support", "ROLE_admin");
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
