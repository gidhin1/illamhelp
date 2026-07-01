import { afterEach, describe, expect, it, vi } from "vitest";

import { createSafeMediaObjectUrl, revokeSafeObjectUrl } from "./safe-object-url";

describe("safe object URLs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and revokes blob URLs for allowed media files", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:http://localhost/media");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const file = new File(["image"], "profile.jpg", { type: "image/jpeg" });

    const objectUrl = createSafeMediaObjectUrl(file);

    expect(objectUrl).toBe("blob:http://localhost/media");
    expect(createObjectUrl).toHaveBeenCalledWith(file);

    if (objectUrl) revokeSafeObjectUrl(objectUrl);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:http://localhost/media");
  });

  it("rejects unsupported image types before creating preview URLs", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const file = new File(["<svg></svg>"], "profile.svg", { type: "image/svg+xml" });

    expect(createSafeMediaObjectUrl(file)).toBeNull();
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it("rejects video files unless explicitly allowed", () => {
    const file = new File(["video"], "profile.mp4", { type: "video/mp4" });

    expect(createSafeMediaObjectUrl(file)).toBeNull();
    expect(createSafeMediaObjectUrl(file, { videos: true })).toMatch(/^blob:/);
  });
});
