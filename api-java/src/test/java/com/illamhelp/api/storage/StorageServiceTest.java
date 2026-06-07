package com.illamhelp.api.storage;

import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class StorageServiceTest {
  @Test
  void producesMinioCompatiblePutAndGetPresignedUrls() {
    StorageService service = new StorageService(properties());

    StorageService.PresignedPutTicket upload = service.presignedPut("quarantine", "owner/media", "image/jpeg", "digest");
    StorageService.PresignedGetTicket download = service.presignedGet("approved", "owner/media");

    assertThat(upload.uploadUrl()).contains("localhost:9000").contains("quarantine/owner/media");
    assertThat(upload.requiredHeaders().get("Content-Type")).isEqualTo("image/jpeg");
    assertThat(upload.requiredHeaders().get("x-amz-meta-checksum-sha256")).isEqualTo("digest");
    assertThat(download.downloadUrl()).contains("localhost:9000").contains("approved/owner/media");
  }
}
