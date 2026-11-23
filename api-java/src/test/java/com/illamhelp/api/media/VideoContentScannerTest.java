package com.illamhelp.api.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class VideoContentScannerTest {
  @TempDir Path directory;

  @Test
  void reportsCandidateFramesAndSeparatesUncheckedAudio() throws IOException {
    var photos = mock(PhotoContentScanner.class);
    when(photos.scan(any(), eq("image/png"))).thenReturn(
        Map.of("contactCheck", "no_candidate"), Map.of("contactCheck", "contact_candidate"));
    var scanner = scanner(photos, 2.5, true,
        "for out do :; done\nprintf fixture > \"${out%-%d.png}-1.png\"\nprintf fixture > \"${out%-%d.png}-2.png\"");

    assertThat(scanner.scan(directory, directory.resolve("upload")))
        .containsEntry("videoFrames", "contact_candidate")
        .containsEntry("videoFrameCount", "2")
        .containsEntry("videoAudio", "audio_not_checked");
  }

  @Test
  void reservesAFrameForADistinctSceneAndReportsOnlyFlaggedTimestamps() throws IOException {
    var photos = mock(PhotoContentScanner.class);
    when(photos.scan(any(), eq("image/png"))).thenAnswer(call ->
        Map.of("contactCheck", new String(call.<byte[]>getArgument(0), java.nio.charset.StandardCharsets.UTF_8)
            .equals("scene") ? "contact_candidate" : "no_candidate"));
    var scanner = scanner(photos, 6, false, """
        for out do :; done
        case "$out" in
          */scene-*)
            printf scene > "${out%-%d.png}-1.png"
            printf '[Parsed_showinfo_2 @ fixture] n: 0 pts: 70 pts_time:0.7
' >&2
            ;;
          *)
            for frame in 1 2 3 4; do
              printf frame > "${out%-%d.png}-$frame.png"
            done
            printf '[Parsed_showinfo_2 @ fixture] n: 0 pts: 0 pts_time:0
' >&2
            printf '[Parsed_showinfo_2 @ fixture] n: 1 pts: 150 pts_time:1.5
' >&2
            printf '[Parsed_showinfo_2 @ fixture] n: 2 pts: 300 pts_time:3
' >&2
            printf '[Parsed_showinfo_2 @ fixture] n: 3 pts: 450 pts_time:4.5
' >&2
            ;;
        esac
        """);

    assertThat(scanner.scan(directory, directory.resolve("upload")))
        .containsEntry("videoSceneCheck", "scene_sampled")
        .containsEntry("videoFrameCount", "4")
        .containsEntry("videoFlaggedSeconds", "0.70");
    org.mockito.Mockito.verify(photos, org.mockito.Mockito.times(4)).scan(any(), eq("image/png"));
  }

  @Test
  void treatsShortDecoderOutputAsIncomplete() throws IOException {
    var photos = mock(PhotoContentScanner.class);
    when(photos.scan(any(), eq("image/png"))).thenReturn(Map.of("contactCheck", "no_candidate"));
    var scanner = scanner(photos, 5, false, "for out do :; done\nprintf fixture > \"${out%-%d.png}-1.png\"");

    assertThat(scanner.scan(directory, directory.resolve("upload")))
        .containsEntry("videoFrames", "incomplete_frame_check")
        .containsEntry("videoAudio", "no_audio_stream");
  }

  @Test
  void reportsTheStrongestVisualBandAndTheActualSampleCount() throws IOException {
    var photos = mock(PhotoContentScanner.class);
    when(photos.scan(any(), eq("image/png"))).thenReturn(
        Map.of("contactCheck", "no_candidate", "visualConfidence", "below_50"),
        Map.of("contactCheck", "no_candidate", "visualConfidence", "90_or_above",
            "visualCheck", VisualContentScanner.CANDIDATE));
    var scanner = scanner(photos, 5, false,
        """
        for out do :; done
        printf fixture > "${out%-%d.png}-1.png"
        printf fixture > "${out%-%d.png}-2.png"
        printf '[Parsed_showinfo_2 @ fixture] n: 0 pts_time:0\\n' >&2
        printf '[Parsed_showinfo_2 @ fixture] n: 1 pts_time:1.25\\n' >&2
        """);

    assertThat(scanner.scan(directory, directory.resolve("upload")))
        .containsEntry("videoVisualCheck", "possible_explicit_imagery")
        .containsEntry("videoVisualFrameCount", "2")
        .containsEntry("videoVisualFlaggedSeconds", "1.25")
        .containsEntry("visualConfidence", "90_or_above");
  }

  @Test
  void leavesOverLimitVideosInReviewAndToolFailuresRetryable() throws IOException {
    var photos = mock(PhotoContentScanner.class);
    assertThat(scanner(photos, 61, false, "exit 1").scan(directory, directory.resolve("upload")))
        .containsEntry("videoFrames", "outside_screening_limits");
    assertThatThrownBy(() -> scanner(photos, 6, false, "exit 1").scan(directory, directory.resolve("upload")))
        .isInstanceOf(IOException.class);
    verifyNoInteractions(photos);
  }

  private VideoContentScanner scanner(PhotoContentScanner photos, double duration, boolean audio, String ffmpeg)
      throws IOException {
    String streams = "{\"codec_type\":\"video\",\"width\":640,\"height\":360}"
        + (audio ? ",{\"codec_type\":\"audio\"}" : "");
    String probe = "{\"streams\":[" + streams + "],\"format\":{\"duration\":" + duration + "}}";
    return new VideoContentScanner(script("ffmpeg", ffmpeg),
        script("ffprobe", "printf '%s' '" + probe + "'"), new ObjectMapper(), photos,
        new VideoAudioScanner("", "", new ObjectMapper()));
  }

  private String script(String name, String body) throws IOException {
    Path path = Files.writeString(directory.resolve(name), "#!/bin/sh\n" + body + "\n");
    Files.setPosixFilePermissions(path, PosixFilePermissions.fromString("rwx------"));
    return path.toString();
  }
}
