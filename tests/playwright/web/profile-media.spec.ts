import { expect, Page, test } from "@playwright/test";

import { makeUser, waitForSuccessMessage } from "../utils/flow-helpers";

async function waitForAuthResponse(
  page: Page,
  path: string,
  method: string
): Promise<import("@playwright/test").Response | null> {
  try {
    return await page.waitForResponse(
      (response) =>
        response.url().includes(path) && response.request().method() === method,
      { timeout: 15_000 }
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
  await page.goto("/");
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
}

async function registerByUi(page: Page): Promise<void> {
  const user = makeUser("seeker");
  await resetBrowserSession(page);
  await page.goto("/auth/register");
  await page.getByLabel("First name").fill(user.firstName);
  await page.getByLabel("Last name").fill(user.lastName);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Username (optional)").fill(user.username);
  await page.getByLabel("Phone (optional)").fill("+919876543210");
  await page.getByLabel("Password").fill(user.password);

  const responsePromise = waitForAuthResponse(page, "/auth/register", "POST");
  await page.locator("form button[type='submit']").first().click();
  await assertAuthResponse(responsePromise);
  await expect(page).toHaveURL(/\/jobs$/);
}

test("web profile page updates profile and uploads media", async ({ page }) => {
  await registerByUi(page);

  await page.goto("/profile");
  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("Area").fill("Kakkanad");
  await page.getByLabel("Services offered").fill("plumber, electrician");
  await page.getByTestId("profile-phone-input").fill("+919812345678");
  await page.getByRole("button", { name: "Save profile" }).click();
  await waitForSuccessMessage(page, "Profile updated.");

  const payload = Buffer.from(`e2e-media-${Date.now()}`, "utf8");
  await page
    .locator("input[type='file']")
    .setInputFiles({ name: "work-proof.jpg", mimeType: "image/jpeg", buffer: payload });
  await page.getByRole("button", { name: "Upload for review" }).click();
  await waitForSuccessMessage(page, "Uploaded successfully. Review started.");
  await expect(page.getByText("State: scanning").first()).toBeVisible();
});
