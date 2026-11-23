package com.illamhelp.api.media;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class VideoContentScanner {
  private static final int FRAME_LIMIT = 4;
  private static final Pattern FRAME_TIME = Pattern.compile(
      "Parsed_showinfo[^\\r\\n]*?\\bn:\\s*([0-9]+)[^\\r\\n]*?\\bpts_time:\\s*([0-9.eE+\\-]+)");
  private static final int MAX_DURATION_SECONDS = 60;
  private static final long MAX_PIXELS = 8_847_360;
  private static final long MAX_FRAME_BYTES = 4 * 1024 * 1024;
  private final String ffmpeg;
  private final String ffprobe;
  private final ObjectMapper mapper;
  private final PhotoContentScanner photos;
  private final VideoAudioScanner audioScanner;

  VideoContentScanner(@Value("${illamhelp.video-ffmpeg-executable:}") String ffmpeg,
      @Value("${illamhelp.video-ffprobe-executable:}") String ffprobe,
      ObjectMapper mapper, PhotoContentScanner photos, VideoAudioScanner audioScanner) {
    this.ffmpeg = ffmpeg;
    this.ffprobe = ffprobe;
    this.mapper = mapper;
    this.photos = photos;
    this.audioScanner = audioScanner;
  }

  boolean enabled() {
    return !ffmpeg.isBlank() && !ffprobe.isBlank();
  }

  Map<String, String> scan(Path directory, Path input) throws IOException {
    var probe = mapper.readTree(run(List.of(ffprobe, "-v", "error", "-protocol_whitelist", "file",
        "-format_whitelist", "mov,matroska,webm", "-show_entries", "stream=codec_type,width,height,channels:format=duration",
        "-of", "json", input.toString()), 12, false));
    int audioTracks = 0;
    int audioChannels = 0;
    long pixels = -1;
    for (var stream : probe.path("streams")) {
      String type = stream.path("codec_type").asText();
      if ("audio".equals(type)) {
        audioTracks++;
        audioChannels = stream.path("channels").asInt();
      }
      if ("video".equals(type) && pixels < 0) {
        pixels = stream.path("width").asLong() * stream.path("height").asLong();
      }
    }
    double duration = probe.path("format").path("duration").asDouble(Double.NaN);
    if (pixels <= 0 || pixels > MAX_PIXELS || !Double.isFinite(duration)
        || duration <= 0 || duration > MAX_DURATION_SECONDS) {
      return Map.of("videoFrames", "outside_screening_limits", "videoAudio",
          audioTracks == 0 ? "no_audio_stream" : "audio_not_checked");
    }

    double interval = duration / FRAME_LIMIT;
    var samples = extract(directory, input, "frame",
        "isnan(prev_selected_t)+gte(t-prev_selected_t," + interval + ")", FRAME_LIMIT);
    String sceneCheck = "no_scene_sample";
    try {
      var scene = extract(directory, input, "scene", "gt(scene,0.35)", 1);
      if (!scene.isEmpty() && scene.getFirst().seconds() != null) {
        var candidate = scene.getFirst();
        // Preserve at least three spaced frames when a distinct scene is added.
        var nearest = samples.stream().filter(sample -> sample.seconds() != null)
            .min(Comparator.comparingDouble(sample -> Math.abs(sample.seconds() - candidate.seconds())));
        if (nearest.isPresent() && Math.abs(nearest.get().seconds() - candidate.seconds()) < 0.15) {
          sceneCheck = "scene_already_sampled";
        } else {
          if (samples.size() >= FRAME_LIMIT) {
            samples.remove(nearest.orElse(samples.getLast()));
          }
          samples.add(candidate);
          sceneCheck = "scene_sampled";
        }
      } else if (!scene.isEmpty()) {
        sceneCheck = "scene_timestamp_unavailable";
      }
    } catch (IOException exception) {
      if (Thread.currentThread().isInterrupted()) {
        throw exception;
      }
      sceneCheck = "unavailable";
    }

    int frames = 0;
    boolean candidate = false;
    boolean ambiguous = false;
    boolean unchecked = false;
    int visualFrames = 0;
    int strongestVisualBand = -1;
    var flaggedTimes = new ArrayList<Double>();
    var visualFlaggedTimes = new ArrayList<Double>();
    for (var sample : samples) {
      Path frame = sample.path();
      if (Files.size(frame) > MAX_FRAME_BYTES) {
        unchecked = true;
        continue;
      }
      var checks = photos.scan(Files.readAllBytes(frame), "image/png");
      String contact = checks.get("contactCheck");
      String visualConfidence = checks.get("visualConfidence");
      if (visualConfidence != null) {
        visualFrames++;
        strongestVisualBand = Math.max(strongestVisualBand, VisualContentScanner.BANDS.indexOf(visualConfidence));
        if (sample.seconds() != null && VisualContentScanner.CANDIDATE.equals(checks.get("visualCheck"))) {
          visualFlaggedTimes.add(sample.seconds());
        }
      }
      frames++;
      candidate |= "contact_candidate".equals(contact);
      if (sample.seconds() != null && ("contact_candidate".equals(contact) || "ambiguous_number".equals(contact))) {
        flaggedTimes.add(sample.seconds());
      }
      ambiguous |= "ambiguous_number".equals(contact);
      unchecked |= contact == null || "not_run".equals(contact);
    }
    String frameCheck = candidate ? "contact_candidate" : ambiguous ? "ambiguous_number"
        : unchecked || frames < FRAME_LIMIT ? "incomplete_frame_check" : "no_candidate_in_sample";
    var result = new LinkedHashMap<>(Map.of("videoFrames", frameCheck, "videoFrameCount", Integer.toString(frames),
        "videoSceneCheck", sceneCheck));
    if (strongestVisualBand >= 0) {
      String visualCheck = strongestVisualBand > 0 ? VisualContentScanner.CANDIDATE
          : visualFrames < FRAME_LIMIT ? "incomplete_visual_check" : VisualContentScanner.NO_CANDIDATE;
      result.put("videoVisualCheck", visualCheck);
      result.put("visualConfidence", VisualContentScanner.BANDS.get(strongestVisualBand));
      result.put("visualDetector", VisualContentScanner.DETECTOR);
      result.put("videoVisualFrameCount", Integer.toString(visualFrames));
      if (!visualFlaggedTimes.isEmpty()) {
        result.put("videoVisualFlaggedSeconds", formatSeconds(visualFlaggedTimes));
      }
    }
    result.putAll(audioScanner.scan(ffmpeg, directory, input, audioTracks, audioChannels, (int) Math.ceil(duration)));
    if (!flaggedTimes.isEmpty()) {
      result.put("videoFlaggedSeconds", formatSeconds(flaggedTimes));
    }
    return result;
  }

  private static String formatSeconds(List<Double> flaggedTimes) {
    return flaggedTimes.stream().distinct().sorted()
        .map(seconds -> String.format(java.util.Locale.ROOT, "%.2f", seconds))
        .collect(java.util.stream.Collectors.joining(","));
  }

  private record FrameSample(Path path, Double seconds) {}

  private ArrayList<FrameSample> extract(Path directory, Path input, String prefix, String expression, int limit)
      throws IOException {
    byte[] diagnostics = run(List.of(ffmpeg, "-nostdin", "-hide_banner", "-nostats", "-loglevel", "info", "-xerror",
        "-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,webm", "-threads", "1",
        "-max_pixels", Long.toString(MAX_PIXELS), "-i", input.toString(), "-map", "0:v:0", "-an", "-sn", "-dn",
        "-t", Integer.toString(MAX_DURATION_SECONDS), "-filter_threads", "1", "-vf",
        "select='" + expression + "',scale=960:960:force_original_aspect_ratio=decrease,showinfo",
        "-fps_mode", "passthrough", "-frames:v", Integer.toString(limit), "-threads", "1",
        directory.resolve(prefix + "-%d.png").toString()), 20, true);

    var timestamps = FRAME_TIME.matcher(new String(diagnostics, StandardCharsets.UTF_8));
    var seconds = new Double[limit];
    while (timestamps.find()) {
      int index = Integer.parseInt(timestamps.group(1));
      double value = Double.parseDouble(timestamps.group(2));
      if (index < limit && Double.isFinite(value) && value >= 0 && value <= MAX_DURATION_SECONDS) {
        seconds[index] = value;
      }
    }
    var frames = new ArrayList<FrameSample>();
    for (int index = 0; index < limit; index++) {
      Path path = directory.resolve(prefix + "-" + (index + 1) + ".png");
      if (Files.exists(path)) {
        frames.add(new FrameSample(path, seconds[index]));
      }
    }
    return frames;
  }

  static byte[] run(List<String> command, int timeoutSeconds, boolean diagnostics) throws IOException {
    // Commands use configured tools, fixed options, and server-created paths inside the scan directory.
    var builder = new ProcessBuilder(command); // nosemgrep: java.lang.security.audit.command-injection-process-builder.command-injection-process-builder
    if (diagnostics) {
      builder.redirectErrorStream(true);
    } else {
      builder.redirectError(ProcessBuilder.Redirect.DISCARD);
    }
    Process process = builder.start();
    FutureTask<byte[]> output = new FutureTask<>(() -> process.getInputStream().readNBytes(16385));
    Thread.ofVirtual().start(output);
    try {
      if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS) || process.exitValue() != 0) {
        throw new IOException("Video screening tool did not complete successfully");
      }
      byte[] bytes = output.get(1, TimeUnit.SECONDS);
      if (bytes.length > 16384) {
        throw new IOException("Video screening output limit exceeded");
      }
      return bytes;
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new IOException("Video screening interrupted", exception);
    } catch (ExecutionException | TimeoutException exception) {
      throw new IOException("Video screening output unavailable", exception);
    } finally {
      process.destroyForcibly();
      output.cancel(true);
    }
  }
}
