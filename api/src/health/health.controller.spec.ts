import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../common/database/database.service";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns ok status when DB is reachable", async () => {
    const dbMock = {
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 })
    } as unknown as DatabaseService;

    const controller = new HealthController(dbMock);
    const response = await controller.health();

    expect(response.status).toBe("ok");
    expect(response.db).toBe("up");
    expect(typeof response.timestamp).toBe("string");
  });
});
