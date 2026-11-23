package com.illamhelp.api.media;

import com.illamhelp.api.storage.StorageService;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class ClamAvMediaScanner {
  private final StorageService storage;
  private final String host;
  private final int port;
  private final PhotoContentScanner photos;
  private final VideoContentScanner videos;

  ClamAvMediaScanner(StorageService storage, @Value("${illamhelp.clamav-host:}") String host,
      @Value("${illamhelp.clamav-port:3310}") int port, PhotoContentScanner photos, VideoContentScanner videos) {
    this.storage = storage;
    this.host = host;
    this.port = port;
    this.photos = photos;
    this.videos = videos;
  }

  enum Result { DISABLED, CLEAN, INFECTED, UNVERIFIED }

  record Screening(Result malware, Map<String, String> contentChecks) {
    Screening(Result malware) {
      this(malware, Map.of());
    }
  }

  Screening scan(Map<String, Object> asset) throws IOException {
    if (host.isBlank() || "verification_document".equals(asset.get("purpose"))) {
      return new Screening(Result.DISABLED);
    }
    String checksum = String.valueOf(asset.get("checksumSha256"));
    long size = ((Number) asset.get("fileSizeBytes")).longValue();
    if (!checksum.matches("[0-9a-fA-F]{64}") || size <= 0) {
      return new Screening(Result.UNVERIFIED);
    }
    FutureTask<Screening> task = new FutureTask<>(() -> scanObject(asset, checksum, size));
    Thread.ofVirtual().start(task);
    try {
      return task.get("video".equals(asset.get("kind")) && videos.enabled() ? 150 : 85, TimeUnit.SECONDS);
    } catch (InterruptedException exception) {
      task.cancel(true);
      Thread.currentThread().interrupt();
      throw new IOException("Media scan interrupted", exception);
    } catch (TimeoutException exception) {
      task.cancel(true);
      throw new IOException("Media scan timed out", exception);
    } catch (ExecutionException exception) {
      throw new IOException("Media scan failed", exception.getCause());
    }
  }

  private Screening scanObject(Map<String, Object> asset, String checksum, long size) throws IOException {
    if ("video".equals(asset.get("kind")) && videos.enabled() && size <= 100 * 1024 * 1024) {
      Path directory = Files.createTempDirectory("illamhelp-video-screening-");
      Path input = directory.resolve("upload");
      try {
        Result malware;
        try (var output = Files.newOutputStream(input)) {
          malware = scanBytes(asset, checksum, size, output);
        }
        return malware == Result.CLEAN ? new Screening(malware, videos.scan(directory, input)) : new Screening(malware);
      } finally {
        try (var files = Files.newDirectoryStream(directory)) {
          for (Path file : files) {
            Files.deleteIfExists(file);
          }
        }
        Files.deleteIfExists(directory);
      }
    }
    if ("image".equals(asset.get("kind")) && size <= 16 * 1024 * 1024) {
      var captured = new ByteArrayOutputStream();
      Result malware = scanBytes(asset, checksum, size, captured);
      return malware == Result.CLEAN
          ? new Screening(malware, photos.scan(captured.toByteArray(), String.valueOf(asset.get("contentType"))))
          : new Screening(malware);
    }
    Result malware = scanBytes(asset, checksum, size, OutputStream.nullOutputStream());
    if (malware == Result.CLEAN && "video".equals(asset.get("kind"))) {
      String frames = videos.enabled() ? "outside_screening_limits" : "not_run";
      return new Screening(malware, Map.of("videoFrames", frames, "videoAudio", "not_run"));
    }
    return new Screening(malware);
  }

  private Result scanBytes(Map<String, Object> asset, String checksum, long size, OutputStream captured)
      throws IOException {
    return storage.readForScreening(String.valueOf(asset.get("bucketName")), String.valueOf(asset.get("objectKey")),
        input -> {
          try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 2000);
            socket.setSoTimeout(15000);
            try (DataOutputStream output = new DataOutputStream(socket.getOutputStream())) {
              output.write("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));
              byte[] buffer = new byte[8192];
              MessageDigest digest = sha256();
              long deadline = System.nanoTime() + Duration.ofSeconds(60).toNanos();
              long total = 0;
              int length;
              while ((length = input.read(buffer)) != -1) {
                total += length;
                if (total > size || System.nanoTime() > deadline) {
                  throw new IOException("Media scan stream limit reached");
                }
                digest.update(buffer, 0, length);
                captured.write(buffer, 0, length);
                output.writeInt(length);
                output.write(buffer, 0, length);
              }
              output.writeInt(0);
              output.flush();
              if (total != size || !checksum.equalsIgnoreCase(HexFormat.of().formatHex(digest.digest()))) {
                return Result.UNVERIFIED;
              }
              String response = readResponse(socket);
              if ("stream: OK".equals(response)) {
                return Result.CLEAN;
              }
              if (response.startsWith("stream: ") && response.endsWith(" FOUND")) {
                return Result.INFECTED;
              }
              throw new IOException("ClamAV did not return a complete scan result");
            }
          }
        });
  }

  private static String readResponse(Socket socket) throws IOException {
    var input = socket.getInputStream();
    StringBuilder response = new StringBuilder();
    for (int i = 0; i < 1024; i++) {
      int value = input.read();
      if (value == 0) {
        return response.toString();
      }
      if (value < 0) {
        break;
      }
      response.append((char) value);
    }
    throw new IOException("Incomplete ClamAV response");
  }

  private static MessageDigest sha256() {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 unavailable", exception);
    }
  }
}
