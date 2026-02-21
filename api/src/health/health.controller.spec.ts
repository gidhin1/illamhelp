import { describe, expect, it } from "vitest";

import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns ok status", () => {
    const controller = new HealthController();
    const response = controller.health();

    expect(response.status).toBe("ok");
    expect(typeof response.timestamp).toBe("string");
  });
});
