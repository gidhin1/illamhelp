package com.illamhelp.api.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import javax.sound.sampled.AudioFileFormat;
import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class VideoAudioScannerTest {
  @TempDir Path directory;

  @Test
  void returnsOnlySafeEvidenceForSpokenContactsAndRemovesTemporaryFiles() throws IOException {
    String ffmpeg = decoder((byte) 1);
    var scanner = scanner("""
        {"result":{"language":"ml"},"transcription":[
          {"text":"ഫോൺ ഒമ്പത് എട്ട് ഏഴ് ആറ്, അഞ്ച് നാല് മൂന്ന് രണ്ട് ഒന്ന് പൂജ്യം","offsets":{"from":1460}}
        ]}
        """);
    assertThat(scanner.scan(ffmpeg, directory, directory.resolve("upload"), 1, 1, 10))
        .containsExactlyInAnyOrderEntriesOf(java.util.Map.of("videoAudio", "spoken_contact_candidate",
            "videoAudioDetector", "whisper.cpp", "videoAudioFlaggedSeconds", "1.46"));
    assertThat(directory.resolve("audio.wav")).doesNotExist();
    assertThat(directory.resolve("transcription.json")).doesNotExist();
  }

  @Test
  void checksNumbersSplitAcrossSegmentsWithoutInventingATimestamp() throws IOException {
    var scanner = scanner("""
        {"result":{"language":"en"},"transcription":[
          {"text":"Call nine eight seven six five","offsets":{"from":100}},
          {"text":"four three two one zero","offsets":{"from":1200}}
        ]}
        """);
    assertThat(scanner.scan(decoder((byte) 1), directory, directory.resolve("upload"), 1, 1, 10))
        .containsEntry("videoAudio", "spoken_contact_candidate")
        .doesNotContainKey("videoAudioFlaggedSeconds");
  }

  @Test
  void distinguishesSilentMonoAndIncompleteCoverage() throws IOException {
    var scanner = scanner("this output should not be read for silence");
    String ffmpeg = decoder((byte) 0);
    Path input = directory.resolve("upload");
    assertThat(scanner.scan(ffmpeg, directory, input, 0, 0, 10)).containsEntry("videoAudio", "no_audio_stream");
    assertThat(scanner.scan(ffmpeg, directory, input, 1, 1, 10)).containsEntry("videoAudio", "silent_audio");
    assertThat(scanner.scan(ffmpeg, directory, input, 1, 2, 10)).containsEntry("videoAudio", "speech_unconfirmed");
    assertThat(scanner.scan(ffmpeg, directory, input, 2, 2, 10)).containsEntry("videoAudio", "multiple_audio_tracks");
  }

  @Test
  void routesUnsupportedLanguageAndEmptyTranscriptsToReview() throws IOException {
    String ffmpeg = decoder((byte) 1);
    Path input = directory.resolve("upload");
    assertThat(scanner("""
        {"result":{"language":"fr"},"transcription":[{"text":"texte non pris en charge"}]}
        """).scan(ffmpeg, directory, input, 1, 1, 10))
        .containsEntry("videoAudio", "unsupported_audio_language");
    assertThat(scanner("""
        {"result":{"language":"en"},"transcription":[]}
        """).scan(ffmpeg, directory, input, 1, 1, 10)).containsEntry("videoAudio", "speech_unconfirmed");
  }

  @Test
  void leavesDecoderFailuresAndMalformedTranscriptsRetryableWithoutLoggingText() throws IOException {
    var scanner = scanner("{\"private transcript\"");
    Path input = directory.resolve("upload");
    assertThatThrownBy(() -> scanner.scan(script("failed-decoder", "exit 1"), directory, input, 1, 1, 10))
        .isInstanceOf(IOException.class);
    String ffmpeg = decoder((byte) 1);
    assertThatThrownBy(() -> scanner.scan(ffmpeg, directory, input, 1, 1, 10))
        .isInstanceOf(IOException.class).hasMessage("Invalid video transcription output").hasNoCause();
    assertThat(directory.resolve("audio.wav")).doesNotExist();
    assertThat(directory.resolve("transcription.json")).doesNotExist();
  }

  private String decoder(byte sample) throws IOException {
    byte[] samples = {sample, 0, sample, 0};
    var format = new AudioFormat(16000, 16, 1, true, false);
    try (var audio = new AudioInputStream(new ByteArrayInputStream(samples), format, 2)) {
      AudioSystem.write(audio, AudioFileFormat.Type.WAVE, directory.resolve("fixture.wav").toFile());
    }
    return script("ffmpeg", "for out do :; done\ncp \"$(dirname \"$out\")/fixture.wav\" \"$out\"");
  }

  private VideoAudioScanner scanner(String json) throws IOException {
    return new VideoAudioScanner(script("whisper-cli",
        "for out do :; done\ncat > \"$out.json\" <<'JSON'\n" + json + "\nJSON"), "model", new ObjectMapper());
  }

  private String script(String name, String contents) throws IOException {
    Path path = Files.writeString(directory.resolve(name), "#!/bin/sh\n" + contents + "\n");
    Files.setPosixFilePermissions(path, PosixFilePermissions.fromString("rwx------"));
    return path.toString();
  }
}
