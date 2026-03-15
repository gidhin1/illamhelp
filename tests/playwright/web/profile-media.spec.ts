import { expect, Page, test } from "@playwright/test";

import { makeUser, waitForSuccessMessage } from "../utils/flow-helpers";

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
  test.setTimeout(45_000);
  await registerByUi(page);

  await clickMainNav(page, "Profile");
  const memberIdText = (await page.getByTestId("profile-user-id").textContent()) ?? "";
  const memberId = memberIdText.trim();
  expect(memberId.length).toBeGreaterThan(2);

  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("Area").fill("Kakkanad");
  await page.getByTestId("profile-skill-picker").click();
  await page.getByTestId("profile-skill-search").fill("other");
  await page.getByTestId("profile-skill-option-other").click();
  await expect(page.getByTestId("profile-skill-search")).toBeHidden();
  await expect(page.getByTestId("profile-skill-custom")).toBeVisible();
  await page.getByTestId("profile-skill-custom").fill("Mural art");
  await page.getByTestId("profile-skill-proficiency").selectOption("advanced");
  await page.getByTestId("profile-skill-add").click();
  await page.getByTestId("profile-skill-level-mural-art").selectOption("expert");
  await expect(page.getByText(/mural art/i).first()).toBeVisible();
  await page.getByTestId("profile-phone-input").fill("+919812345678");
  await page.getByRole("button", { name: "Save profile" }).click();
  await waitForSuccessMessage(page, "Profile updated.");
  await expect(page.getByTestId("member-avatar-placeholder")).toBeVisible();

  const payload = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=",
    "base64"
  );
  await page.getByTestId("profile-avatar-trigger").click();
  await expect(page.getByTestId("profile-avatar-upload")).toBeVisible();
  await expect(page.getByTestId("profile-avatar-cancel")).toBeVisible();
  await expect(page.getByTestId("profile-avatar-view")).toHaveCount(0);
  await expect(page.getByTestId("profile-avatar-edit")).toHaveCount(0);
  await expect(page.getByTestId("profile-avatar-remove")).toHaveCount(0);
  const firstChooser = page.waitForEvent("filechooser");
  await page.getByTestId("profile-avatar-upload").click();
  await (await firstChooser).setFiles({
    name: "avatar-proof.png",
    mimeType: "image/png",
    buffer: payload
  });
  await waitForSuccessMessage(page, "Avatar uploaded. It is now in the moderation queue.");
  await expect(page.getByText(/Pending avatar review/i).first()).toBeVisible();
  await page.getByTestId("profile-avatar-trigger").click();
  await expect(page.getByTestId("profile-avatar-view")).toBeVisible();
  await expect(page.getByTestId("profile-avatar-edit")).toBeVisible();
  await expect(page.getByTestId("profile-avatar-remove")).toBeVisible();
  await page.getByTestId("profile-avatar-view").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  const secondChooser = page.waitForEvent("filechooser");
  await page.getByTestId("profile-avatar-trigger").click();
  await page.getByTestId("profile-avatar-edit").click();
  await (await secondChooser).setFiles({
    name: "avatar-proof-2.png",
    mimeType: "image/png",
    buffer: payload
  });
  await waitForSuccessMessage(page, "Avatar uploaded. It is now in the moderation queue.");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("profile-avatar-trigger").click();
  await page.getByTestId("profile-avatar-remove").click();
  await waitForSuccessMessage(page, "Pending avatar removed.");

  await page
    .locator("input[type='file']")
    .last()
    .setInputFiles({ name: "work-proof.png", mimeType: "image/png", buffer: payload });
  await page.getByRole("button", { name: /^Upload$/i }).click();
  await waitForSuccessMessage(page, "Uploaded successfully. Review started.");
  await expect(page.getByText(/work-proof\.png/i).first()).toBeVisible();

  await page.getByTestId("profile-public-owner-input").fill(memberId);
  await page.getByTestId("profile-public-load-button").click();
  await expect(page.getByText("Approved entries will appear here.").first()).toBeVisible();
});
