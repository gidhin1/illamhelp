import { describe, expect, it } from "vitest";
import { alertCategory, alertDestination } from "../src/alerts-ui";
import { bookingControls } from "../src/booking-ui";
import { contactShareStatus, validateStopSharingReason } from "../src/contact-sharing";
import { validateApplicationMessage } from "../src/job-application";
import { canEmailLegalContact, filterFaqEntries, legalSectionId } from "../src/legal-ui";
import { formatUiError } from "../src/ui-errors";
import { readyVerificationDocuments, verificationStatus } from "../src/verification-ui";
import type { JobDto } from "../src/index";

describe("member workflow contracts", () => {
  it.each([
    ["posted", undefined, undefined, true, false],
    ["accepted", undefined, "start", true, true],
    ["in_progress", "complete", undefined, true, false],
    ["completed", "payment-done", undefined, false, false],
    ["payment_done", undefined, "payment-received", false, false],
    ["payment_received", "close", undefined, false, false],
    ["closed", undefined, undefined, false, false],
    ["cancelled", undefined, undefined, false, false],
  ] satisfies [JobDto["status"], string | undefined, string | undefined, boolean, boolean][])(
    "exposes the right actions for both participants when a booking is %s",
    (status, ownerAction, providerAction, canCancel, canRevoke) => {
      expect(bookingControls(status, "owner")).toMatchObject({ primary: ownerAction, canCancel, canRevoke });
      expect(bookingControls(status, "provider")).toMatchObject({ primary: providerAction, canCancel, canRevoke: false });
    }
  );

  it.each([["  ", true], ["  abc ", false], ["  abcd ", true], ["a".repeat(500), true], ["a".repeat(501), false]])(
    "validates trimmed job application length",
    (message, valid) => expect(validateApplicationMessage(message) === null).toBe(valid)
  );

  it("marks sharing expired at the exact deadline for both database and ISO timestamps", () => {
    const deadline = Date.parse("2026-06-14T12:00:00Z");
    for (const expiresAt of ["2026-06-14 12:00:00+00", "2026-06-14T17:30:00+05:30"]) {
      expect(contactShareStatus({ status: "active", expiresAt }, deadline - 1)).toBe("active");
      expect(contactShareStatus({ status: "active", expiresAt }, deadline)).toBe("expired");
      expect(contactShareStatus({ status: "revoked", expiresAt }, deadline)).toBe("revoked");
    }
    expect(validateStopSharingReason("  OK ")).toMatch(/3 characters/);
    expect(validateStopSharingReason("  End ")).toBeNull();
  });

  it("routes an applicant alert to its job and falls back when the job reference is missing or malformed", () => {
    expect(alertDestination("job_application_received", { jobId: "job-123" })?.href).toBe("/jobs/job-123#job-applicants");
    for (const jobId of [undefined, 12, " https://invalid.example", "../profile"]) {
      expect(alertDestination("job_application_received", { jobId })?.href).toBe("/jobs/posted");
    }
    expect(alertCategory("verification_rejected")).toBe("Verification");
    expect(alertDestination("media_approved", {})).toBeNull();
  });

  it("leaves old, incomplete, and unrelated files out of a fresh verification submission", () => {
    const file = { purpose: "verification_document", state: "approved", createdAt: "2026-06-15T12:00:00Z" };
    const cutoff = "2026-06-14T12:00:00Z";
    expect(readyVerificationDocuments([
      { ...file, createdAt: cutoff }, { ...file, purpose: "profile" },
      { ...file, state: "uploaded" }, { ...file, state: "rejected" }, file,
    ], cutoff)).toEqual([file]);
    expect(verificationStatus("rejected").label).toBe("Needs changes");
    expect(verificationStatus("constructor").tone).toBe("info");
  });

  it("finds FAQ terms across the question and answer and keeps placeholder addresses inactive", () => {
    const entries = [
      { question: "Where are my documents?", answer: "Verification files stay private." },
      { question: "Where are my jobs?", answer: "Open the jobs page." },
    ];
    expect(filterFaqEntries(entries, "  DOCUMENTS   Private ")).toEqual([entries[0]]);
    expect(filterFaqEntries(entries, "missing")).toEqual([]);
    expect(filterFaqEntries(entries, "")).toEqual(entries);
    expect(legalSectionId({ title: " Access & choices ", body: [] })).toBe("access-choices");
    expect(canEmailLegalContact("support@illamhelp.example")).toBe(false);
    expect(canEmailLegalContact("support@illamhelp.example.org")).toBe(true);
  });

  it("uses recovery messages for transport failures and actionable copy for a known business error", () => {
    expect(formatUiError(new Error("Failed to fetch"), "Try again.")).toBe("Try again.");
    expect(formatUiError(new Error("Invalid credentials"), "Try again.")).toMatch(/username or email and password/);
  });
});
