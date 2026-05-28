package com.illamhelp.api.media;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class MediaModerationScheduler {
  private final MediaAutomatedModerationWorker worker;
  private final boolean enabled;
  private final int batchSize;

  public MediaModerationScheduler(MediaAutomatedModerationWorker worker,
      @Value("${illamhelp.media-moderation-worker-enabled:true}") boolean enabled,
      @Value("${illamhelp.media-moderation-worker-batch-size:10}") int batchSize) {
    this.worker = worker;
    this.enabled = enabled;
    this.batchSize = Math.max(1, Math.min(batchSize, 100));
  }

  @Scheduled(fixedDelayString = "${illamhelp.media-moderation-worker-delay-ms:5000}")
  public void processPendingJobs() {
    if (!enabled) {
      return;
    }
    for (int processed = 0; processed < batchSize; processed++) {
      if (!worker.processNext().selected()) {
        return;
      }
    }
  }
}
