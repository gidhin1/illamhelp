package com.illamhelp.api.storage;

import com.illamhelp.api.config.AppProperties;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

@Service
public class StorageService {
  private final AppProperties properties;

  public StorageService(AppProperties properties) {
    this.properties = properties;
  }

  public PresignedPutTicket presignedPut(String bucket, String key, String contentType, String checksumSha256) {
    Instant expiresAt = Instant.now().plus(Duration.ofMinutes(15));
    try (S3Presigner presigner = presigner()) {
      PutObjectRequest request = PutObjectRequest.builder()
          .bucket(bucket)
          .key(key)
          .contentType(contentType)
          .metadata(Map.of("checksum-sha256", checksumSha256))
          .build();
      String url = presigner.presignPutObject(PutObjectPresignRequest.builder()
              .signatureDuration(Duration.ofMinutes(15))
              .putObjectRequest(request)
              .build())
          .url()
          .toString();
      Map<String, String> requiredHeaders = new LinkedHashMap<>();
      requiredHeaders.put("Content-Type", contentType);
      requiredHeaders.put("x-amz-meta-checksum-sha256", checksumSha256);
      return new PresignedPutTicket(url, expiresAt.toString(), requiredHeaders);
    }
  }

  public PresignedGetTicket presignedGet(String bucket, String key) {
    Instant expiresAt = Instant.now().plus(Duration.ofMinutes(15));
    try (S3Presigner presigner = presigner()) {
      GetObjectRequest request = GetObjectRequest.builder().bucket(bucket).key(key).build();
      String url = presigner.presignGetObject(GetObjectPresignRequest.builder()
              .signatureDuration(Duration.ofMinutes(15))
              .getObjectRequest(request)
              .build())
          .url()
          .toString();
      return new PresignedGetTicket(url, expiresAt.toString());
    }
  }

  public UploadedObject headObject(String bucket, String key) {
    try (S3Client client = client()) {
      HeadObjectResponse response = client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
      return new UploadedObject(response.contentType(), response.contentLength(),
          response.metadata().get("checksum-sha256"), response.eTag());
    }
  }

  public record UploadedObject(String contentType, Long contentLength, String checksumSha256, String etag) {
  }

  public record PresignedPutTicket(String uploadUrl, String expiresAt, Map<String, String> requiredHeaders) {
  }

  public record PresignedGetTicket(String downloadUrl, String downloadUrlExpiresAt) {
  }

  private S3Client client() {
    return S3Client.builder()
        .endpointOverride(URI.create(properties.minioEndpoint()))
        .region(Region.of(properties.minioRegion()))
        .credentialsProvider(StaticCredentialsProvider.create(
            AwsBasicCredentials.create(properties.minioAccessKey(), properties.minioSecretKey())))
        .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
        .build();
  }

  private S3Presigner presigner() {
    return S3Presigner.builder()
        .endpointOverride(URI.create(properties.minioEndpoint()))
        .region(Region.of(properties.minioRegion()))
        .credentialsProvider(StaticCredentialsProvider.create(
            AwsBasicCredentials.create(properties.minioAccessKey(), properties.minioSecretKey())))
        .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
        .build();
  }
}
