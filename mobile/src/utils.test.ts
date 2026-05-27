import { describe, expect, it, vi } from "vitest";

import type { ProfileRecord } from "./api";
import {
  asError,
  buildProfileForm,
  formatBytes,
  parseServiceCategories,
  randomHex,
  shouldForceSignOut,
  validateJobPayload
} from "./utils";

describe("mobile screen utilities", () => {
  it("returns all invalid job field messages together", () => {
    expect(validateJobPayload({
      category: "x",
      title: "fix",
      description: "short",
      locationText: "",
      visibility: "public"
    })).toBe(
      "Category must be at least 2 characters, Title must be at least 4 characters, Description must be at least 10 characters, Location must be at least 2 characters"
    );
  });

  it("accepts valid jobs and normalizes service categories", () => {
    expect(validateJobPayload({
      category: "plumber",
      title: "Repair sink",
      description: "Repair the leaking kitchen sink today.",
      locationText: "Kochi",
      visibility: "connections_only"
    })).toBeNull();
    expect(parseServiceCategories(" plumber, electrician, , cleaner ")).toEqual([
      "plumber",
      "electrician",
      "cleaner"
    ]);
  });

  it("maps nullable profile contact data into editable fields", () => {
    const profile = {
      firstName: "Anita",
      lastName: null,
      city: "Kochi",
      area: null,
      serviceCategories: ["cleaner", "cook"],
      contact: {
        email: "anita@example.com",
        phone: null,
        alternatePhone: "+919000000000",
        fullAddress: null
      }
    } as ProfileRecord;

    expect(buildProfileForm(profile)).toEqual({
      firstName: "Anita",
      lastName: "",
      city: "Kochi",
      area: "",
      serviceCategories: "cleaner, cook",
      email: "anita@example.com",
      phone: "",
      alternatePhone: "+919000000000",
      fullAddress: ""
    });
  });

  it("formats sizes and identifies authentication failures", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(shouldForceSignOut("Invalid or expired bearer token")).toBe(true);
    expect(shouldForceSignOut("Unable to load jobs")).toBe(false);
    expect(asError(new Error("Unavailable"), "fallback")).toBe("Unavailable");
    expect(asError("unexpected", "fallback")).toBe("fallback");
  });

  it("generates requested-length hexadecimal identifiers", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);

    expect(randomHex(4)).toBe("ffff");
  });
});
