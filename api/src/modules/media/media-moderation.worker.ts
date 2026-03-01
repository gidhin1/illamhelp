import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { MediaModerationService } from "./media-moderation.service";

@Injectable()
export class MediaModerationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaModerationWorker.name);
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(
    private readonly moderationService: MediaModerationService,
    configService: ConfigService
  ) {
    this.enabled = configService.get<string>("MEDIA_MODERATION_WORKER_ENABLED", "false") === "true";
    this.intervalMs = this.parsePositiveInt(
      configService.get<string>("MEDIA_MODERATION_WORKER_INTERVAL_MS", "10000"),
      10000
    );
    this.batchSize = this.parsePositiveInt(
      configService.get<string>("MEDIA_MODERATION_WORKER_BATCH_SIZE", "5"),
      5
    );
  }

  onModuleInit(): void {
    if (!this.enabled) {
      return;
    }

    this.logger.log(
      `Media moderation worker enabled (interval=${this.intervalMs}ms batch=${this.batchSize})`
    );
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
    void this.runOnce();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runOnce(): Promise<void> {
    if (this.inFlight) {
      return;
    }

    this.inFlight = true;
    try {
      const result = await this.moderationService.processPendingJobs({
        limit: this.batchSize
      });
      if (result.selected > 0) {
        this.logger.log(
          `Processed moderation batch selected=${result.selected} processed=${result.processed} errors=${result.errors}`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown worker error";
      this.logger.error(`Failed to process moderation batch: ${message}`);
    } finally {
      this.inFlight = false;
    }
  }

  private parsePositiveInt(value: string, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.trunc(parsed);
  }
}
