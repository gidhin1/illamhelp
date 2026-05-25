package com.illamhelp.api.storage;

import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;

class StorageServiceTest {
  @Test
  void producesMinioCompatiblePutAndGetPresignedUrls() {
    StorageService service = new StorageService(properties());

    Map<String, Object> upload = service.presignedPut("quarantine", "owner/media", "image/jpeg", "digest");
    Map<String, Object> download = service.presignedGet("approved", "owner/media");

    assertThat(String.valueOf(upload.get("uploadUrl"))).contains("localhost:9000").contains("quarantine/owner/media");
    assertThat(((Map<?, ?>) upload.get("requiredHeaders")).get("Content-Type")).isEqualTo("image/jpeg");
    assertThat(((Map<?, ?>) upload.get("requiredHeaders")).get("x-amz-meta-checksum-sha256")).isEqualTo("digest");
    assertThat(String.valueOf(download.get("downloadUrl"))).contains("localhost:9000").contains("approved/owner/media");
  }
}
