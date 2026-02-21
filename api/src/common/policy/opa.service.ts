import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

interface OpaAllowResponse {
  result?: boolean;
}

@Injectable()
export class OpaService {
  private readonly logger = new Logger(OpaService.name);
  private readonly opaUrl: string;

  constructor(configService: ConfigService) {
    this.opaUrl = configService.get<string>("OPA_URL", "http://localhost:8181");
  }

  async canViewPii(input: Record<string, unknown>): Promise<boolean> {
    const url = `${this.opaUrl}/v1/data/illamhelp/pii/allow`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input })
      });

      if (!response.ok) {
        this.logger.warn(`OPA returned non-200 status: ${response.status}`);
        return false;
      }

      const payload = (await response.json()) as OpaAllowResponse;
      return payload.result === true;
    } catch (error) {
      this.logger.warn(`OPA request failed: ${(error as Error).message}`);
      return false;
    }
  }
}
