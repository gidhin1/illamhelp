import { afterEach, describe, expect, it, vi } from "vitest";

import { clearAccessToken, readAccessToken, writeAccessToken } from "./session-storage";

describe("admin session cookie storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns no token during server rendering", () => {
    expect(readAccessToken()).toBeNull();
  });

  it("uses an admin-only secure cookie and clears it on sign out", () => {
    const documentStub = { cookie: "illamhelp_admin_access_token=admin%20token" };
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    vi.stubGlobal("document", documentStub);

    expect(readAccessToken()).toBe("admin token");
    writeAccessToken("new token");
    expect(documentStub.cookie).toContain("illamhelp_admin_access_token=new%20token");
    expect(documentStub.cookie).toContain("; Secure");
    clearAccessToken();
    expect(documentStub.cookie).toContain("Max-Age=0");
  });
});
