package com.illamhelp.api.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.illamhelp.api.storage.StorageService;
import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

class ClamAvMediaScannerTest {
  private static final byte[] CONTENT = "sample upload".getBytes(StandardCharsets.UTF_8);

  @Test
  void recognizesCleanAndInfectedResponsesForVerifiedBytes() throws Exception {
    assertThat(scan("stream: OK\0", checksum(), CONTENT.length)).isEqualTo(ClamAvMediaScanner.Result.CLEAN);
    assertThat(scan("stream: test-signature FOUND\0", checksum(), CONTENT.length))
        .isEqualTo(ClamAvMediaScanner.Result.INFECTED);
  }

  @Test
  void rejectsChecksumMismatchAsUnverified() throws Exception {
    assertThat(scan("stream: OK\0", "0".repeat(64), CONTENT.length))
        .isEqualTo(ClamAvMediaScanner.Result.UNVERIFIED);
  }

  @Test
  void treatsScannerErrorsAndIncompleteResponsesAsFailures() {
    assertThatThrownBy(() -> scan("stream: size limit exceeded ERROR\0", checksum(), CONTENT.length))
        .isInstanceOf(IOException.class);
    assertThatThrownBy(() -> scan("stream: OK", checksum(), CONTENT.length)).isInstanceOf(IOException.class);
  }

  @Test
  void rejectsPublicScannerAddressesBeforeReadingUploads() throws Exception {
    var storage = mock(StorageService.class);
    var scanner = new ClamAvMediaScanner(storage, "203.0.113.1", 3310,
        mock(PhotoContentScanner.class), mock(VideoContentScanner.class));

    assertThatThrownBy(() -> scanner.scan(Map.of(
        "kind", "image", "checksumSha256", checksum(), "fileSizeBytes", CONTENT.length)))
        .isInstanceOf(IOException.class)
        .hasRootCauseMessage("ClamAV requires a private network endpoint");
    org.mockito.Mockito.verifyNoInteractions(storage);
  }

  @Test
  void skipsVerificationDocuments() throws IOException {
    var scanner = new ClamAvMediaScanner(mock(StorageService.class), "unused", 3310, new PhotoContentScanner("", new VisualContentScanner("")), mock(VideoContentScanner.class));
    assertThat(scanner.scan(Map.of("purpose", "verification_document")).malware()).isEqualTo(ClamAvMediaScanner.Result.DISABLED);
  }

  @Test
  void photoChecksReceiveOnlyHashVerifiedBytesAfterMalwareScreening() throws Exception {
    var photos = mock(PhotoContentScanner.class);
    when(photos.scan(org.mockito.AdditionalMatchers.aryEq(CONTENT), eq("image/png")))
        .thenReturn(Map.of("photoValidation", "undecodable"));

    var report = scan("stream: OK\0", checksum(), CONTENT.length, photos, "image");

    assertThat(report.contentChecks()).containsEntry("photoValidation", "undecodable");
    org.mockito.Mockito.verify(photos).scan(org.mockito.AdditionalMatchers.aryEq(CONTENT), eq("image/png"));

    var unverifiedPhotos = mock(PhotoContentScanner.class);
    var unverified = scan("stream: OK\0", "0".repeat(64), CONTENT.length, unverifiedPhotos, "image");
    assertThat(unverified.contentChecks()).isEmpty();
    org.mockito.Mockito.verifyNoInteractions(unverifiedPhotos);
  }

  @Test
  void sendsVerifiedVideoBytesToTheFrameScannerAndCleansUpTheTemporaryFile() throws Exception {
    var videos = mock(VideoContentScanner.class);
    when(videos.enabled()).thenReturn(true);
    var captured = new java.util.concurrent.atomic.AtomicReference<Path>();
    when(videos.scan(any(), any())).thenAnswer(call -> {
      Path input = call.getArgument(1);
      captured.set(input);
      assertThat(Files.readAllBytes(input)).isEqualTo(CONTENT);
      return Map.of("videoFrames", "contact_candidate");
    });

    var report = scan("stream: OK\0", checksum(), CONTENT.length, mock(PhotoContentScanner.class), "video", videos);

    assertThat(report.contentChecks()).containsEntry("videoFrames", "contact_candidate");
    assertThat(captured.get()).doesNotExist();
    assertThat(captured.get().getParent()).doesNotExist();
  }

  @Test
  @EnabledIfEnvironmentVariable(named = "ILLAMHELP_PHOTO_SMOKE_CLAMD_PORT", matches = "[0-9]+")
  void screensSyntheticWebpWithLiveClamavAndTesseract() throws Exception {
    byte[] bytes = Files.readAllBytes(Path.of(System.getenv("ILLAMHELP_PHOTO_SMOKE_WEBP")));
    String sha256 = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    var storage = mock(StorageService.class);
    when(storage.readForScreening(eq("quarantine"), eq("object"), any())).thenAnswer(call -> {
      StorageService.ObjectReader<?> reader = call.getArgument(2);
      return reader.read(new ByteArrayInputStream(bytes));
    });
    int port = Integer.parseInt(System.getenv("ILLAMHELP_PHOTO_SMOKE_CLAMD_PORT"));
    String visualExecutable = System.getenv().getOrDefault("MEDIA_VISUAL_EXECUTABLE", "");
    var photos = new PhotoContentScanner(System.getenv("ILLAMHELP_PHOTO_SMOKE_TESSERACT"),
        new VisualContentScanner(visualExecutable));
    var scanner = new ClamAvMediaScanner(storage, "127.0.0.1", port, photos, mock(VideoContentScanner.class));

    var report = scanner.scan(Map.of("bucketName", "quarantine", "objectKey", "object",
        "fileSizeBytes", bytes.length, "checksumSha256", sha256, "kind", "image", "contentType", "image/webp"));

    assertThat(report.malware()).isEqualTo(ClamAvMediaScanner.Result.CLEAN);
    assertThat(report.contentChecks()).containsEntry("photoValidation", "decoded")
        .containsEntry("contactCheck", "contact_candidate");
    if (!visualExecutable.isBlank()) {
      assertThat(report.contentChecks()).containsEntry("visualDetector", VisualContentScanner.DETECTOR)
          .containsKeys("visualCheck", "visualConfidence");
    }
  }

  private ClamAvMediaScanner.Result scan(String response, String checksum, long size) throws Exception {
    return scan(response, checksum, size, new PhotoContentScanner("", new VisualContentScanner("")), "video").malware();
  }

  private ClamAvMediaScanner.Screening scan(String response, String checksum, long size,
      PhotoContentScanner photos, String kind) throws Exception {
    return scan(response, checksum, size, photos, kind, mock(VideoContentScanner.class));
  }

  private ClamAvMediaScanner.Screening scan(String response, String checksum, long size,
      PhotoContentScanner photos, String kind, VideoContentScanner videos) throws Exception {
    StorageService storage = mock(StorageService.class);
    when(storage.readForScreening(eq("quarantine"), eq("object"), any())).thenAnswer(call -> {
      StorageService.ObjectReader<?> reader = call.getArgument(2);
      return reader.read(new ByteArrayInputStream(CONTENT));
    });

    try (var server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
      server.setSoTimeout(5000);
      FutureTask<Void> result = new FutureTask<>(() -> {
        try (var peer = server.accept()) {
          peer.setSoTimeout(5000);
          var input = new DataInputStream(peer.getInputStream());
          assertThat(input.readNBytes(10)).isEqualTo("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));
          assertThat(input.readNBytes(input.readInt())).isEqualTo(CONTENT);
          assertThat(input.readInt()).isZero();
          peer.getOutputStream().write(response.getBytes(StandardCharsets.US_ASCII));
        }
        return null;
      });
      Thread.ofVirtual().start(result);
      var scanner = new ClamAvMediaScanner(storage, server.getInetAddress().getHostAddress(), server.getLocalPort(), photos, videos);
      try {
        return scanner.scan(Map.of("bucketName", "quarantine", "objectKey", "object", "fileSizeBytes", size,
            "checksumSha256", checksum, "kind", kind, "contentType", "image/png"));
      } finally {
        result.get(10, TimeUnit.SECONDS);
      }
    }
  }

  private String checksum() throws Exception {
    return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(CONTENT));
  }
}
