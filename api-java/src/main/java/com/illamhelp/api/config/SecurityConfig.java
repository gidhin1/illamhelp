package com.illamhelp.api.config;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
  private final AppProperties properties;

  public SecurityConfig(AppProperties properties) {
    this.properties = properties;
  }

  @Bean
  SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        .csrf(csrf -> csrf.disable())
        .cors(Customizer.withDefaults())
        .authorizeHttpRequests(auth -> auth
            .requestMatchers(HttpMethod.GET, "/api/v1/health").permitAll()
            .requestMatchers(HttpMethod.POST, "/api/v1/auth/register").permitAll()
            .requestMatchers(HttpMethod.POST, "/api/v1/auth/login").permitAll()
            .requestMatchers(HttpMethod.POST, "/api/v1/auth/refresh").permitAll()
            .requestMatchers(HttpMethod.POST, "/api/v1/auth/logout").permitAll()
            .requestMatchers(HttpMethod.GET, "/api/v1/media/public/**").permitAll()
            .requestMatchers("/api/docs/**", "/v3/api-docs/**", "/swagger-ui/**").permitAll()
            .anyRequest().authenticated())
        .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt ->
            jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));
    return http.build();
  }

  private Converter<Jwt, AbstractAuthenticationToken> jwtAuthenticationConverter() {
    return jwt -> new JwtAuthenticationToken(jwt, authorities(jwt), jwt.getSubject());
  }

  private Collection<GrantedAuthority> authorities(Jwt jwt) {
    return extractResourceRoles(jwt).stream()
        .distinct()
        .map(role -> role.startsWith("ROLE_") ? role : "ROLE_" + role)
        .map(SimpleGrantedAuthority::new)
        .map(GrantedAuthority.class::cast)
        .toList();
  }

  @SuppressWarnings("unchecked")
  private List<String> extractResourceRoles(Jwt jwt) {
    Object resourceAccess = jwt.getClaim("resource_access");
    if (!(resourceAccess instanceof Map<?, ?> resources)) {
      return List.of();
    }
    Object appResource = resources.get(properties.keycloakClientId());
    if (!(appResource instanceof Map<?, ?> resource) || !(resource.get("roles") instanceof List<?> roles)) {
      return List.of();
    }
    return roles.stream().map(String::valueOf).toList();
  }
}
