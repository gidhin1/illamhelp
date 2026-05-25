package com.illamhelp.api.config;

import java.util.Arrays;
import java.util.List;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.PathMatchConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class WebConfig implements WebMvcConfigurer {
  private final AppProperties properties;

  public WebConfig(AppProperties properties) {
    this.properties = properties;
  }

  @Override
  public void configurePathMatch(PathMatchConfigurer configurer) {
    configurer.addPathPrefix(properties.apiPrefix(), controllerType ->
        controllerType.getPackageName().startsWith("com.illamhelp.api")
            && !controllerType.getPackageName().contains(".config"));
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    List<String> origins = Arrays.stream(properties.corsOrigins().split(","))
        .map(String::trim)
        .filter(origin -> !origin.isBlank())
        .toList();
    registry.addMapping("/**")
        .allowedOrigins(origins.toArray(String[]::new))
        .allowedMethods("GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS")
        .allowedHeaders("Content-Type", "Authorization", "Accept", "Origin")
        .allowCredentials(false);
  }
}
