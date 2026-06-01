import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearAccessToken,
  clearRefreshToken,
  readAccessToken,
  readRefreshToken,
  writeAccessToken,
  writeRefreshToken
} from "./session-storage";

describe("web session cookie storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not read tokens during server rendering", () => {
    expect(readAccessToken()).toBeNull();
  });

  it("reads encoded tokens and writes secure cookies over https", () => {
    const documentStub = { cookie: "illamhelp_access_token=token%20value" };
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    vi.stubGlobal("document", documentStub);

    expect(readAccessToken()).toBe("token value");
    writeAccessToken("next token");
    expect(documentStub.cookie).toContain("illamhelp_access_token=next%20token");
    expect(documentStub.cookie).toContain("; Secure");
    writeRefreshToken("refresh");
    expect(documentStub.cookie).toContain("illamhelp_refresh_token=refresh");
    clearAccessToken();
    expect(documentStub.cookie).toContain("Max-Age=0");
  });

  it("reads refresh cookies and omits Secure on non-https origins", () => {
    const documentStub = {
      cookie: "theme=dark; illamhelp_refresh_token=refresh%20token; other=value"
    };
    vi.stubGlobal("window", { location: { protocol: "http:" } });
    vi.stubGlobal("document", documentStub);

    expect(readRefreshToken()).toBe("refresh token");
    writeAccessToken("plain");
    expect(documentStub.cookie).toContain("illamhelp_access_token=plain");
    expect(documentStub.cookie).not.toContain("; Secure");
    clearRefreshToken();
    expect(documentStub.cookie).toContain("illamhelp_refresh_token=");
    expect(documentStub.cookie).toContain("Max-Age=0");
  });
});
