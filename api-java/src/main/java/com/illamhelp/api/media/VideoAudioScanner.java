package com.illamhelp.api.media;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.UnsupportedAudioFileException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class VideoAudioScanner {
  private static final int MAX_TRANSCRIPT_BYTES = 128 * 1024;
  private static final Map<String, String> DIGITS = Map.ofEntries(
      Map.entry("zero", "0"), Map.entry("one", "1"), Map.entry("two", "2"), Map.entry("three", "3"),
      Map.entry("four", "4"), Map.entry("five", "5"), Map.entry("six", "6"), Map.entry("seven", "7"),
      Map.entry("eight", "8"), Map.entry("nine", "9"),
      Map.entry("പൂജ്യം", "0"), Map.entry("ഒന്ന്", "1"), Map.entry("രണ്ട്", "2"), Map.entry("മൂന്ന്", "3"),
      Map.entry("നാല്", "4"), Map.entry("അഞ്ച്", "5"), Map.entry("ആറ്", "6"), Map.entry("ഏഴ്", "7"),
      Map.entry("എട്ട്", "8"), Map.entry("ഒമ്പത്", "9"), Map.entry("ഒൻപത്", "9"));
  private static final Pattern DIGIT_WORD = Pattern.compile("[\\p{L}\\p{M}]+");
  private final String executable;
  private final String model;
  private final ObjectMapper mapper;

  VideoAudioScanner(@Value("${illamhelp.video-whisper-executable:}") String executable,
      @Value("${illamhelp.video-whisper-model:}") String model, ObjectMapper mapper) {
    this.executable = executable;
    this.model = model;
    this.mapper = mapper;
  }

  Map<String, String> scan(String ffmpeg, Path directory, Path input, int tracks, int channels, int maxSeconds)
      throws IOException {
    if (tracks == 0) {
      return Map.of("videoAudio", "no_audio_stream");
    }
    if (executable.isBlank() || model.isBlank()) {
      return Map.of("videoAudio", "audio_not_checked");
    }
    if (tracks > 1) {
      return Map.of("videoAudio", "multiple_audio_tracks");
    }
    Path wav = directory.resolve("audio.wav");
    Path output = directory.resolve("transcription");
    Path json = directory.resolve("transcription.json");
    try {
      VideoContentScanner.run(List.of(ffmpeg, "-nostdin", "-v", "error", "-xerror", "-protocol_whitelist", "file",
          "-format_whitelist", "mov,matroska,webm", "-threads", "1", "-i", input.toString(), "-map", "0:a:0",
          "-vn", "-sn", "-dn", "-t", Integer.toString(maxSeconds), "-af", "aresample=async=1:first_pts=0",
          "-ac", "1", "-ar", "16000",
          "-c:a", "pcm_s16le", wav.toString()), 12, false);
      if (isSilent(wav)) {
        // A multichannel downmix can cancel speech.
        return Map.of("videoAudio", channels == 1 ? "silent_audio" : "speech_unconfirmed");
      }
      VideoContentScanner.run(List.of(executable, "-m", model, "-f", wav.toString(), "-l", "auto", "-t", "2",
          "-ng", "-np", "-oj", "-of", output.toString()), 40, false);
      try (var transcript = Files.newInputStream(json)) {
        byte[] bytes = transcript.readNBytes(MAX_TRANSCRIPT_BYTES + 1);
        if (bytes.length > MAX_TRANSCRIPT_BYTES) {
          throw new IOException("Video transcription output limit exceeded");
        }
        return summarize(mapper.readTree(bytes), maxSeconds);
      } catch (com.fasterxml.jackson.core.JacksonException exception) {
        // Parser errors can include parts of the private transcript.
        throw new IOException("Invalid video transcription output");
      }
    } finally {
      Files.deleteIfExists(json);
      Files.deleteIfExists(wav);
    }
  }

  private static boolean isSilent(Path wav) throws IOException {
    try (var audio = AudioSystem.getAudioInputStream(wav.toFile())) {
      long frames = audio.getFrameLength();
      if (frames <= 0) {
        throw new IOException("No audio samples decoded");
      }
      byte[] buffer = new byte[8192];
      long bytesRead = 0;
      for (int length; (length = audio.read(buffer)) > 0;) {
        bytesRead += length;
        for (int index = 0; index < length; index++) {
          if (buffer[index] != 0) {
            return false;
          }
        }
      }
      if (bytesRead == 0) {
        throw new IOException("No audio samples decoded");
      }
      return true;
    } catch (UnsupportedAudioFileException exception) {
      throw new IOException("Invalid decoded audio");
    }
  }

  private static Map<String, String> summarize(JsonNode result, int maxSeconds) throws IOException {
    String language = result.path("result").path("language").asText();
    JsonNode segments = result.path("transcription");
    if (language.isBlank() || !segments.isArray()) {
      throw new IOException("Incomplete video transcription output");
    }
    if (!"en".equals(language) && !"ml".equals(language)) {
      return Map.of("videoAudio", "unsupported_audio_language", "videoAudioDetector", "whisper.cpp");
    }
    StringBuilder transcript = new StringBuilder();
    boolean segmentCandidate = false;
    long candidateStart = -1;
    for (JsonNode segment : segments) {
      if (!segment.path("text").isTextual()) {
        throw new IOException("Invalid video transcription segment");
      }
      String text = segment.path("text").asText().strip();
      transcript.append(' ').append(text);
      if ("contact_candidate".equals(classifySpeech(text))) {
        segmentCandidate = true;
        long offset = segment.path("offsets").path("from").asLong(-1);
        if (candidateStart < 0 && offset >= 0 && offset <= maxSeconds * 1000L) {
          candidateStart = offset;
        }
      }
    }
    if (candidateStart >= 0) {
      return Map.of("videoAudio", "spoken_contact_candidate", "videoAudioDetector", "whisper.cpp",
          "videoAudioFlaggedSeconds", String.format(Locale.ROOT, "%.2f", candidateStart / 1000.0));
    }
    String status = switch (segmentCandidate ? "contact_candidate" : classifySpeech(transcript.toString())) {
      case "contact_candidate" -> "spoken_contact_candidate";
      case "ambiguous_number" -> "spoken_number_needs_review";
      default -> transcript.toString().isBlank() ? "speech_unconfirmed" : "no_contact_in_transcript";
    };
    return Map.of("videoAudio", status, "videoAudioDetector", "whisper.cpp");
  }

  private static String classifySpeech(String text) {
    var tokens = DIGIT_WORD.matcher(text.toLowerCase(Locale.ROOT));
    String normalized = tokens.replaceAll(token -> DIGITS.getOrDefault(token.group(), token.group()));
    return PhotoContentScanner.classify(normalized.replaceAll("(?<=\\p{Nd})[,،]\\h*(?=\\p{Nd})", " "));
  }
}
