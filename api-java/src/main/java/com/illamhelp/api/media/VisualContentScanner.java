package com.illamhelp.api.media;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class VisualContentScanner {
  static final String DETECTOR = "Falconsai · 96cb0d0";
  static final List<String> BANDS = List.of("below_50", "50_to_89", "90_or_above");
  static final String CANDIDATE = "possible_explicit_imagery";
  static final String NO_CANDIDATE = "no_visual_candidate";
  private final String executable;

  VisualContentScanner(@Value("${illamhelp.media-visual-executable:}") String executable) {
    this.executable = executable;
  }

  boolean enabled() {
    return !executable.isBlank();
  }

  Map<String, String> scan(byte[] image) throws IOException {
    String result = PhotoContentScanner.runImageTool(List.of(executable), image, 128, 15, 2).strip();
    double score;
    try {
      score = Double.parseDouble(result);
    } catch (NumberFormatException exception) {
      throw new IOException("Invalid visual screening output");
    }
    if (!Double.isFinite(score) || score < 0 || score > 1) {
      throw new IOException("Invalid visual screening score");
    }
    return Map.of("visualCheck", score >= 0.5 ? CANDIDATE : NO_CANDIDATE,
        "visualConfidence", BANDS.get(score >= 0.9 ? 2 : score >= 0.5 ? 1 : 0),
        "visualDetector", DETECTOR);
  }
}
