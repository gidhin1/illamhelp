import path from "node:path";

import { expect, Page, test } from "@playwright/test";

import { makeUser, parseMemberId, waitForSuccessMessage } from "../utils/flow-helpers";

const serviceProofImage = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "service-proof-sink.png"
);
const commonsValveImage = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "commons-plumbing-valve.jpg"
);
const commonsPlumberImage = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "commons-plumber-under-sink.jpg"
);
const serviceProofVideo = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "service-proof-video.mp4"
);
const sampleVideo = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "sample-video-640x360.mp4"
);

function isAuthRateLimitedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("http 429") || message.includes("too many authentication attempts");
}

async function waitForAuthRateLimitBackoff(page: Page, attempt: number): Promise<void> {
  const waitMs = Math.min(20_000, 2_500 * attempt);
  await page.waitForTimeout(waitMs);
}

async function gotoHome(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /IllamHelp/i }).first()).toBeVisible();
}

async function clickMainNav(page: Page, label: string): Promise<void> {
  await page
    .getByRole("link", { name: new RegExp(`\\b${label}\\b`, "i") })
    .first()
    .click();
}

async function waitForAuthResponse(
  page: Page,
  path: string,
  method: string
): Promise<import("@playwright/test").Response | null> {
  try {
    return await page.waitForResponse(
      (response) =>
        response.url().includes(path) && response.request().method() === method,
      { timeout: 8_000 }
    );
  } catch {
    return null;
  }
}

async function assertAuthResponse(
  responsePromise: Promise<import("@playwright/test").Response | null>
): Promise<void> {
  const response = await responsePromise;
  if (!response) {
    throw new Error("Register request was not fired from UI.");
  }
  if (!response.ok()) {
    const payload = await response.text();
    throw new Error(`Register failed with HTTP ${response.status()}: ${payload}`);
  }
}

async function resetBrowserSession(page: Page): Promise<void> {
  await gotoHome(page);
  const signOut = page.getByRole("button", { name: "Sign out" }).first();
  if (await signOut.isVisible()) {
    await signOut.click();
  }

  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = "illamhelp_access_token=; Path=/; Max-Age=0; SameSite=Lax";
  });

  await page.context().clearCookies();
  await gotoHome(page);
}

async function registerByUi(page: Page): Promise<void> {
  const user = makeUser("seeker");
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await resetBrowserSession(page);
    await page.getByRole("link", { name: /join now|sign up|create account|register/i }).first().click();
    await page.getByLabel("First name").fill(user.firstName);
    await page.getByLabel("Last name").fill(user.lastName);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("User ID").fill(user.username);
    await page.getByLabel("Phone (optional)").fill("+919876543210");
    await page.getByLabel("Password").fill(user.password);

    const responsePromise = waitForAuthResponse(page, "/auth/register", "POST");
    await page.locator("form button[type='submit']").first().click();

    try {
      await assertAuthResponse(responsePromise);
      await expect(page).toHaveURL(/\/jobs$/);
      return;
    } catch (error) {
      if (attempt < 8 && isAuthRateLimitedError(error)) {
        await waitForAuthRateLimitBackoff(page, attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Register flow did not complete.");
}

test("web profile page updates profile and uploads media", async ({ page }) => {
  await registerByUi(page);

  await clickMainNav(page, "Profile");
  const memberIdText = (await page.getByTestId("profile-user-id").textContent()) ?? "";
  const memberId = parseMemberId(memberIdText, "profile media owner id");
  expect(memberId.length).toBeGreaterThan(2);

  await expect(page.getByRole("heading", { name: "Your public trust page" })).toBeVisible();
  await expect(page.getByText(/Verification documents never appear here/i)).toBeVisible();

  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("Area").fill("Kakkanad");
  await page.getByLabel("Services offered").fill("plumber, electrician");
  await page.getByTestId("profile-phone-input").fill("+919812345678");
  await page.getByRole("button", { name: "Save profile" }).click();
  await waitForSuccessMessage(page, "Profile updated.");

  await page
    .getByLabel("Add profile media")
    .setInputFiles([serviceProofImage, commonsValveImage, commonsPlumberImage, serviceProofVideo, sampleVideo]);
  await expect(page.getByTestId("profile-media-upload-selected")).toContainText("5 selected files");
  await expect(page.getByTestId("profile-media-upload-selected")).toContainText("3 photos");
  await expect(page.getByTestId("profile-media-upload-selected")).toContainText("2 videos");
  await expect(page.getByText("service-proof-sink.png").first()).toBeVisible();
  await expect(page.getByText("commons-plumbing-valve.jpg").first()).toBeVisible();
  await expect(page.getByText("commons-plumber-under-sink.jpg").first()).toBeVisible();
  await expect(page.getByText("service-proof-video.mp4").first()).toBeVisible();
  await expect(page.getByText("sample-video-640x360.mp4").first()).toBeVisible();
  await page.getByRole("button", { name: "Upload 5 files" }).click();
  await waitForSuccessMessage(page, "5 profile files uploaded for review.");
  await expect(page.getByTestId("profile-media-upload-pending")).toContainText(/Photo|Video/);
  await expect(page.getByTestId("profile-media-upload-pending")).toContainText(/uploaded|scanning|ai reviewed|human review pending/i);

  await page.getByTestId("profile-public-owner-input").fill(memberId);
  await page.getByTestId("profile-public-load-button").click();
  await expect(page.getByText("Approved profile photos and videos will appear here.").first()).toBeVisible();
});
