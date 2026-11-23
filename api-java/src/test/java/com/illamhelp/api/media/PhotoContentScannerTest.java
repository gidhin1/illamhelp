package com.illamhelp.api.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Set;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PhotoContentScannerTest {
  @TempDir Path temporary;

  @Test
  void validatesActualImageFormatBeforeRunningOcr() throws IOException {
    var scanner = new PhotoContentScanner("/unavailable", new VisualContentScanner(""));
    assertThat(scanner.scan(png(), "image/jpeg")).containsEntry("photoValidation", "format_mismatch");
    assertThat(scanner.scan(new byte[]{1, 2, 3}, "image/png")).containsEntry("photoValidation", "undecodable");
    assertThat(scanner.scan(png(), "image/webp")).containsEntry("photoValidation", "format_mismatch");
    assertThat(new PhotoContentScanner("", new VisualContentScanner("")).scan(png(), "image/png"))
        .containsEntry("photoValidation", "decoded").containsEntry("contactCheck", "not_run");
  }

  @Test
  void decodesWebpAndRoutesAnimatedWebpToReviewWithoutOcr() throws IOException {
    byte[] still = Base64.getDecoder().decode(
        "UklGRkYAAABXRUJQVlA4IDoAAACwAQCdASoQABAAAgA0JaQAAuYeHuoAAP7+etZ/ZiXOlLMRqOQKXmZvkhMNa17RG3jAeFgRjW3gAAAA");
    byte[] animated = Base64.getDecoder().decode(
        "UklGRtgAAABXRUJQVlA4WAoAAAACAAAADwAADwAAQU5JTQYAAAD/////AABBTk1GUgAAAAAAAAAAAA8AAA8AAGQAAABWUDggOgAAALABAJ0BKhAA"
        + "EAACADQlpAAC5h4e6gAA/v561n9mJc6UsxGo5ApeZm+SEw1rXtEbeMB4WBGNbeAAAABBTk1GUgAAAAAAAAAAAA8AAA8AAGQAAABWUDggOgAAALAB"
        + "AJ0BKhAAEAACADQlpAAC5h4e6gAA/v561n9mJc6UsxGo5ApeZm+SEw1rXtEbeMB4WBGNbeAAAAA=");

    assertThat(new PhotoContentScanner("", new VisualContentScanner("")).scan(still, "image/webp")).containsEntry("photoValidation", "decoded");
    assertThat(new PhotoContentScanner("/unavailable", new VisualContentScanner("")).scan(animated, "image/webp"))
        .containsEntry("photoValidation", "animated_photo").containsEntry("contactCheck", "not_run");
  }

  @Test
  void keepsOnlyEvidenceCategoriesFromTheOcrProcess() throws IOException {
    String command = executable("cat >/dev/null\nprintf '%s\\n' 'Call ൯൮൭൬൫൪൩൨൧൦'");
    assertThat(new PhotoContentScanner(command, new VisualContentScanner("")).scan(png(), "image/png"))
        .containsEntry("photoValidation", "decoded")
        .containsEntry("contactCheck", "contact_candidate")
        .containsEntry("contactDetector", "tesseract eng+mal")
        .hasSize(3);
  }

  @Test
  void runsVisualScreeningOnVerifiedDecodablePhotosWithOcrDisabled() throws IOException {
    String command = executable("test \"$OMP_THREAD_LIMIT\" = 2 || exit 1\ncat >/dev/null\nprintf '0.91\\n'");
    var scanner = new PhotoContentScanner("", new VisualContentScanner(command));
    assertThat(scanner.scan(png(), "image/png"))
        .containsEntry("contactCheck", "not_run")
        .containsEntry("visualCheck", "possible_explicit_imagery")
        .containsEntry("visualConfidence", "90_or_above")
        .containsEntry("visualDetector", VisualContentScanner.DETECTOR);
    assertThat(scanner.scan(png(), "image/jpeg")).doesNotContainKey("visualCheck");
  }

  @Test
  void treatsMalformedVisualOutputAsRetryable() throws IOException {
    String command = executable("cat >/dev/null\nprintf 'NaN\\n'");
    var scanner = new PhotoContentScanner("", new VisualContentScanner(command));
    assertThatThrownBy(() -> scanner.scan(png(), "image/png")).isInstanceOf(IOException.class)
        .hasMessage("Invalid visual screening score");
  }

  @Test
  void scannerFailureIsRetryable() throws IOException {
    String command = executable("cat >/dev/null\nexit 1");
    assertThatThrownBy(() -> new PhotoContentScanner(command, new VisualContentScanner("")).scan(png(), "image/png"))
        .isInstanceOf(IOException.class);
  }

  @Test
  void separatesContactCandidatesFromNumbersOnEquipment() {
    assertThat(PhotoContentScanner.classify("test @ example . org")).isEqualTo("contact_candidate");
    assertThat(PhotoContentScanner.classify("Telegram: @test_handle")).isEqualTo("contact_candidate");
    assertThat(PhotoContentScanner.classify("വിളിക്കുക ൯൮൭൬൫൪൩൨൧൦")).isEqualTo("contact_candidate");
    assertThat(PhotoContentScanner.classify("Serial number 1234 567890")).isEqualTo("ambiguous_number");
    assertThat(PhotoContentScanner.classify("Model 12")).isEqualTo("no_candidate");
  }

  private String executable(String body) throws IOException {
    Path script = temporary.resolve("fake-ocr");
    Files.writeString(script, "#!/bin/sh\n" + body + "\n");
    Files.setPosixFilePermissions(script, Set.of(java.nio.file.attribute.PosixFilePermission.OWNER_READ,
        java.nio.file.attribute.PosixFilePermission.OWNER_EXECUTE));
    return script.toString();
  }

  private byte[] png() throws IOException {
    var output = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(16, 16, BufferedImage.TYPE_BYTE_GRAY), "png", output);
    return output.toByteArray();
  }
}
