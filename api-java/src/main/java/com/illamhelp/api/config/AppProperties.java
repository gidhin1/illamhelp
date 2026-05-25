package com.illamhelp.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "illamhelp")
public record AppProperties(
    String apiPrefix,
    String corsOrigins,
    boolean strictOriginCheck,
    String profilePiiEncryptionKey,
    long authRateLimitWindowMs,
    int authRateLimitMax,
    long jobsWriteRateLimitWindowMs,
    int jobsWriteRateLimitMax,
    int jobAssignmentRevokeWindowMinutes,
    long connectionsWriteRateLimitWindowMs,
    int connectionsWriteRateLimitMax,
    long consentWriteRateLimitWindowMs,
    int consentWriteRateLimitMax,
    long mediaWriteRateLimitWindowMs,
    int mediaWriteRateLimitMax,
    long searchRateLimitWindowMs,
    int searchRateLimitMax,
    String opaUrl,
    String keycloakUrl,
    String keycloakRealm,
    String keycloakClientId,
    String keycloakClientSecret,
    String keycloakAdminRealm,
    String keycloakAdminClientId,
    String keycloakAdminUsername,
    String keycloakAdminPassword,
    String minioEndpoint,
    String minioAccessKey,
    String minioSecretKey,
    String minioRegion,
    String minioQuarantineBucket,
    String minioApprovedBucket,
    long mediaMaxImageBytes,
    long mediaMaxVideoBytes,
    String mediaAllowedImageTypes,
    String mediaAllowedVideoTypes,
    boolean openSearchEnabled,
    String openSearchUrl,
    String openSearchIndexJobs,
    int openSearchTimeoutMs
) {
}
