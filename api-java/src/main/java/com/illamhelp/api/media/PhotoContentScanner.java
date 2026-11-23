package com.illamhelp.api.media;

import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class PhotoContentScanner {
  private static final int MAX_OCR_OUTPUT = 64 * 1024;
  private static final long MAX_PIXELS = 32_000_000;
  private static final Pattern EMAIL = Pattern.compile(
      "[a-z0-9._%+-]+\\h*@\\h*[a-z0-9-]+(?:\\h*\\.\\h*[a-z0-9-]+)+", Pattern.CASE_INSENSITIVE);
  private static final Pattern CONTACT_HANDLE = Pattern.compile(
      "(?:whatsapp|telegram|instagram)\\h*[:=-]?\\h*@[a-z0-9_.]{3,}", Pattern.CASE_INSENSITIVE);
  private static final Pattern NUMBER = Pattern.compile("(?<![0-9])(?:[0-9][(). +\\-]*){7,15}[0-9](?![0-9])");
  private static final Pattern CONTACT_CONTEXT = Pattern.compile(
      "phone|mobile|call|contact|whatsapp|ഫോൺ|വിളിക്കുക", Pattern.CASE_INSENSITIVE);
  private final String executable;
  private final VisualContentScanner visual;

  PhotoContentScanner(@Value("${illamhelp.photo-ocr-executable:}") String executable, VisualContentScanner visual) {
    this.executable = executable;
    this.visual = visual;
  }

  Map<String, String> scan(byte[] image, String mimeType) throws IOException {
    var checked = validate(image, mimeType);
    if (!"decoded".equals(checked.status())) {
      return Map.of("photoValidation", checked.status(), "contactCheck", "not_run");
    }
    var evidence = new HashMap<String, String>();
    if (checked.visualInput() != null) {
      evidence.putAll(visual.scan(checked.visualInput()));
    }
    evidence.put("photoValidation", checked.status());
    evidence.put("contactCheck", "not_run");
    if (!executable.isBlank()) {
      evidence.put("contactCheck", classify(runImageTool(
          List.of(executable, "stdin", "stdout", "-l", "eng+mal", "--psm", "11"), image, MAX_OCR_OUTPUT, 20, 1)));
      evidence.put("contactDetector", "tesseract eng+mal");
    }
    return evidence;
  }

  private record CheckedImage(String status, byte[] visualInput) {
    CheckedImage(String status) { this(status, null); }
  }

  private CheckedImage validate(byte[] image, String mimeType) throws IOException {
    try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(image))) {
      var readers = ImageIO.getImageReaders(input);
      if (!readers.hasNext()) {
        return new CheckedImage("undecodable");
      }
      var reader = readers.next();
      try {
        reader.setInput(input, true, true);
        String actualType = switch (reader.getFormatName().toLowerCase(Locale.ROOT)) {
          case "jpeg" -> "image/jpeg";
          case "png" -> "image/png";
          case "webp" -> "image/webp";
          default -> "";
        };
        if (!mimeType.equals(actualType)) {
          return new CheckedImage("format_mismatch");
        }
        int width = reader.getWidth(0);
        int height = reader.getHeight(0);
        if (width <= 0 || height <= 0 || (long) width * height > MAX_PIXELS) {
          return new CheckedImage("dimensions_out_of_bounds");
        }
        // WebP reports an unknown count without scanning animation frames.
        if ("image/webp".equals(actualType) && reader.getNumImages(false) != 1) {
          return new CheckedImage("animated_photo");
        }
        var parameters = reader.getDefaultReadParam();
        int stride = Math.max(1, Math.max(width, height) / 1600);
        parameters.setSourceSubsampling(stride, stride, 0, 0);
        BufferedImage decoded = reader.read(0, parameters);
        try {
          return new CheckedImage("decoded", visual.enabled() ? visualInput(decoded) : null);
        } finally {
          decoded.flush();
        }
      } catch (javax.imageio.IIOException exception) {
        return new CheckedImage("undecodable");
      } finally {
        reader.dispose();
      }
    }
  }

  private static byte[] visualInput(BufferedImage decoded) throws IOException {
    double scale = Math.min(1, 960.0 / Math.max(decoded.getWidth(), decoded.getHeight()));
    int width = Math.max(1, (int) Math.round(decoded.getWidth() * scale));
    int height = Math.max(1, (int) Math.round(decoded.getHeight() * scale));
    var rgb = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
    var graphics = rgb.createGraphics();
    try {
      graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
      graphics.drawImage(decoded, 0, 0, width, height, null);
    } finally {
      graphics.dispose();
    }
    try (var output = new ByteArrayOutputStream()) {
      ImageIO.write(rgb, "png", output);
      return output.toByteArray();
    } finally {
      rgb.flush();
    }
  }

  static String runImageTool(List<String> command, byte[] image, int outputLimit, int timeoutSeconds, int threadLimit)
      throws IOException {
    // The command uses a deployment-configured executable and fixed arguments. Images go through stdin.
    var builder = new ProcessBuilder(command); // nosemgrep: java.lang.security.audit.command-injection-process-builder.command-injection-process-builder
    builder.redirectError(ProcessBuilder.Redirect.DISCARD);
    builder.environment().put("OMP_THREAD_LIMIT", Integer.toString(threadLimit));
    Process process = builder.start();
    FutureTask<byte[]> reader = new FutureTask<>(() -> process.getInputStream().readNBytes(outputLimit + 1));
    FutureTask<Void> writer = new FutureTask<>(() -> {
      try (var input = process.getOutputStream()) {
        input.write(image);
      }
      return null;
    });
    Thread.ofVirtual().start(reader);
    Thread.ofVirtual().start(writer);
    try {
      if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS) || process.exitValue() != 0) {
        throw new IOException("Image screening tool did not complete successfully");
      }
      writer.get(1, TimeUnit.SECONDS);
      byte[] output = reader.get(1, TimeUnit.SECONDS);
      if (output.length > outputLimit) {
        throw new IOException("Image screening output limit exceeded");
      }
      return new String(output, StandardCharsets.UTF_8);
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new IOException("Image screening interrupted", exception);
    } catch (java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException exception) {
      throw new IOException("Image screening stream did not complete", exception);
    } finally {
      process.destroyForcibly();
      reader.cancel(true);
      writer.cancel(true);
    }
  }

  static String classify(String recognized) {
    var normalized = new StringBuilder();
    Normalizer.normalize(recognized, Normalizer.Form.NFKC).codePoints().forEach(codePoint -> {
      int digit = Character.digit(codePoint, 10);
      normalized.appendCodePoint(digit < 0 ? codePoint : '0' + digit);
    });
    String text = normalized.toString();
    if (EMAIL.matcher(text).find() || CONTACT_HANDLE.matcher(text).find()) {
      return "contact_candidate";
    }
    boolean numberSeen = false;
    for (String line : text.split("\\R")) {
      if (NUMBER.matcher(line).find()) {
        if (CONTACT_CONTEXT.matcher(line).find()) {
          return "contact_candidate";
        }
        numberSeen = true;
      }
    }
    return numberSeen ? "ambiguous_number" : "no_candidate";
  }
}
