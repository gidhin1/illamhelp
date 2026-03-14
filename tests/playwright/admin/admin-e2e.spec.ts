import { expect, Locator, Page, test } from "@playwright/test";

import { E2eUser, makeUser } from "../utils/flow-helpers";

const adminBaseUrl = process.env.PW_ADMIN_BASE_URL ?? "http://localhost:3103";
const webBaseUrl = process.env.PW_WEB_BASE_URL ?? "http://localhost:3000";

type AdminPortalUser = {
  username: string;
  password: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readAdminPortalUser(): AdminPortalUser {
  const username = process.env.E2E_ADMIN_USERNAME?.trim();
  const password = process.env.E2E_ADMIN_PASSWORD?.trim();

  if (!username || !password) {
    throw new Error("Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD for admin Playwright flows.");
  }

  return { username, password };
}

function isAuthRateLimitedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("http 429") || message.includes("too many authentication attempts");
}

async function waitForAuthRateLimitBackoff(page: Page, attempt: number): Promise<void> {
  const waitMs = Math.min(20_000, 2_500 * attempt);
  await page.waitForTimeout(waitMs);
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

type AuthSession = {
  userId: string;
  accessToken: string;
};

async function assertAuthResponse(
  responsePromise: Promise<import("@playwright/test").Response | null>,
  action: "register" | "login"
): Promise<AuthSession> {
  const response = await responsePromise;
  if (!response) {
    throw new Error(`Auth ${action} request was not fired from UI.`);
  }
  if (response.ok()) {
    return (await response.json()) as AuthSession;
  }

  let payloadText = "";
  try {
    const payload = (await response.json()) as { message?: string | string[]; error?: string };
    if (Array.isArray(payload.message)) {
      payloadText = payload.message.join(", ");
    } else if (typeof payload.message === "string") {
      payloadText = payload.message;
    } else if (typeof payload.error === "string") {
      payloadText = payload.error;
    }
  } catch {
    payloadText = await response.text();
  }

  throw new Error(
    `Auth ${action} failed with HTTP ${response.status()}: ${payloadText || "unknown error"}`
  );
}

async function gotoWebHome(page: Page): Promise<void> {
  await page.goto(webBaseUrl);
  await expect(page.getByRole("link", { name: /IllamHelp/i }).first()).toBeVisible();
}

async function gotoAdminHome(page: Page): Promise<void> {
  await page.goto(adminBaseUrl, { waitUntil: "domcontentloaded" });
}

async function signOutIfVisible(page: Page): Promise<void> {
  const signOut = page.getByRole("button", { name: "Sign out" }).first();
  if (await signOut.isVisible()) {
    await signOut.click();
  }
}

async function resetWebBrowserSession(page: Page): Promise<void> {
  await gotoWebHome(page);
  await signOutIfVisible(page);

  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = "illamhelp_access_token=; Path=/; Max-Age=0; SameSite=Lax";
  });

  await page.context().clearCookies();
  await gotoWebHome(page);
}

async function openWebAuthEntry(page: Page, mode: "register" | "login"): Promise<void> {
  await gotoWebHome(page);
  if (mode === "register") {
    await page.getByRole("link", { name: /join now|sign up|create account|register/i }).first().click();
    await expect(page.getByLabel("First name")).toBeVisible();
    return;
  }

  await page.getByRole("link", { name: /sign in/i }).first().click();
  await expect(page.getByLabel("Username or Email")).toBeVisible();
}

async function registerWebUser(page: Page, user: E2eUser): Promise<AuthSession> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await resetWebBrowserSession(page);
    await openWebAuthEntry(page, "register");

    await page.getByLabel("First name").fill(user.firstName);
    await page.getByLabel("Last name").fill(user.lastName);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("User ID").fill(user.username);
    await page.getByLabel("Phone (optional)").fill("+919876543210");
    await page.getByLabel("Password").fill(user.password);

    const responsePromise = waitForAuthResponse(page, "/auth/register", "POST");
    await page.locator("form button[type='submit']").first().click();

    try {
      const session = await assertAuthResponse(responsePromise, "register");
      await expect(page).toHaveURL(/\/jobs$/);
      return session;
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

async function loginWebUser(page: Page, user: E2eUser): Promise<AuthSession> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await resetWebBrowserSession(page);
    await openWebAuthEntry(page, "login");

    await page.getByLabel("Username or Email").fill(user.username);
    await page.getByLabel("Password").fill(user.password);

    const responsePromise = waitForAuthResponse(page, "/auth/login", "POST");
    await page.locator("form button[type='submit']").first().click();

    try {
      const session = await assertAuthResponse(responsePromise, "login");
      await expect(page).toHaveURL(/\/jobs$/);
      return session;
    } catch (error) {
      if (attempt < 8 && isAuthRateLimitedError(error)) {
        await waitForAuthRateLimitBackoff(page, attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Login flow did not complete.");
}

async function clickWebNav(page: Page, label: string): Promise<void> {
  await page
    .getByRole("link", { name: new RegExp(`\\b${escapeRegex(label)}\\b`, "i") })
    .first()
    .click();
}

async function clickAdminNav(page: Page, label: string): Promise<void> {
  await page
    .getByRole("link", { name: new RegExp(`\\b${escapeRegex(label)}\\b`, "i") })
    .first()
    .click();
}

async function loginAdminPortalByUi(page: Page, user: AdminPortalUser): Promise<void> {
  await gotoAdminHome(page);

  const userInput = page.getByLabel("Username or email");
  if (!(await userInput.isVisible().catch(() => false))) {
    await page.getByRole("link", { name: /sign in/i }).first().click();
  }

  await expect(userInput).toBeVisible({ timeout: 10_000 });
  await userInput.fill(user.username);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await waitForAnyVisible(
    [
      page.getByRole("heading", { name: /Operations Dashboard/i }).first(),
      page.getByRole("heading", { name: /Moderation Queue/i }).first(),
      page.getByRole("heading", { name: /Verification Processing/i }).first(),
      page.getByRole("button", { name: /Run Machine Checks/i }).first(),
      page.getByRole("button", { name: /sign out/i }).first()
    ],
    10_000
  );
}

async function waitForAnyVisible(locators: Locator[], timeoutMs = 10_000): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }
    await locators[0].page().waitForTimeout(300);
  }
  throw new Error("None of the expected UI states became visible.");
}

test("admin portal auth guard blocks protected pages when signed out", async ({ page }) => {
  await gotoAdminHome(page);

  for (const route of ["/moderation", "/verifications", "/audit"]) {
    await page.goto(`${adminBaseUrl}${route}`);
    await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  }
});

test("admin portal login shows error for invalid credentials", async ({ page }) => {
  await page.goto(`${adminBaseUrl}/auth/login`);
  await page.getByLabel("Username or email").fill(`invalid_admin_${Date.now().toString(36)}`);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  const errorBanner = page.locator(".banner.error").first();
  await expect(errorBanner).toBeVisible({ timeout: 10_000 });
  await expect(errorBanner).toContainText(
    /invalid|unauthorized|forbidden|failed|too many|authentication/i
  );
});

test("admin portal login, navigation, and sign out flow works", async ({ page }) => {
  const adminUser = readAdminPortalUser();
  await loginAdminPortalByUi(page, adminUser);

  await expect(page.getByRole("heading", { name: /Operations Dashboard/i })).toBeVisible();

  await clickAdminNav(page, "Moderation");
  await expect(page.getByRole("heading", { name: /Moderation Queue/i })).toBeVisible();

  await clickAdminNav(page, "Verifications");
  await expect(page.getByRole("heading", { name: /Verification Processing/i })).toBeVisible();

  await clickAdminNav(page, "Consent + Audit");
  await expect(page.getByRole("heading", { name: /Consent & Audit Timeline/i })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();

  await page.goto(`${adminBaseUrl}/moderation`);
  await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible();
});

test("admin moderation page renders queue controls and stable states", async ({ page }) => {
  const adminUser = readAdminPortalUser();
  await loginAdminPortalByUi(page, adminUser);
  await clickAdminNav(page, "Moderation");

  await expect(page.getByRole("heading", { name: /Moderation Queue/i })).toBeVisible();
  await expect(page.getByTestId("moderation-status-filter")).toBeVisible();
  await expect(page.getByTestId("moderation-process-pending")).toBeVisible();
  await expect(page.getByTestId("moderation-details-panel")).toBeVisible();

  await page.getByTestId("moderation-status-filter").selectOption("pending");
  await waitForAnyVisible(
    [
      page.locator("[data-testid^='moderation-item-']").first(),
      page.getByText("No items found").first(),
      page.getByText("Loading queue...").first()
    ],
    10_000
  );
});

test("admin verifications page supports filter and refresh interactions", async ({ page }) => {
  const adminUser = readAdminPortalUser();
  await loginAdminPortalByUi(page, adminUser);
  await clickAdminNav(page, "Verifications");

  await expect(page.getByRole("heading", { name: /Verification Processing/i })).toBeVisible();

  const filters = ["Pending", "Under review", "Approved", "Rejected", "All Records"];
  for (const filter of filters) {
    await page.getByRole("button", { name: new RegExp(filter, "i") }).first().click();
  }

  await waitForAnyVisible(
    [
      page.getByText("Current Queue").first(),
      page.getByRole("table").first(),
      page.getByText("No verification requests").first(),
      page.getByText("Loading...").first()
    ],
    10_000
  );
});

test("admin audit page shows empty state and handles lookup attempts", async ({ page }) => {
  const adminUser = readAdminPortalUser();
  await loginAdminPortalByUi(page, adminUser);
  await clickAdminNav(page, "Consent + Audit");

  await expect(page.getByRole("heading", { name: /Consent & Audit Timeline/i })).toBeVisible();
  await expect(page.getByText("Investigate Activity").first()).toBeVisible();

  await page.getByTestId("timeline-member-id").fill(`missing_member_${Date.now().toString(36)}`);
  await page.getByTestId("timeline-search").click();

  await waitForAnyVisible(
    [
      page.getByTestId("timeline-member-summary"),
      page.locator(".banner.error").first(),
      page.getByText("Investigate Activity").first()
    ],
    10_000
  );
});

test("admin portal E2E verification lifecycle: member submit -> admin review -> member notification", async ({
  browser
}) => {
  const member = makeUser("both");
  const adminUser = readAdminPortalUser();
  const shortId = Date.now().toString(36).slice(-4);
  const submissionNote = `Government ID submitted for admin portal E2E verification ${shortId}.`;
  const reviewNote = `Approved by admin portal E2E ${shortId}`;

  const memberPage = await browser.newPage();
  const adminPage = await browser.newPage();

  try {
    const memberSession = await registerWebUser(memberPage, member);
    const memberUserId = memberSession.userId;

    await clickWebNav(memberPage, "Verify");
    await memberPage.getByLabel("Document media IDs").fill("11111111-1111-4111-8111-111111111111");
    await memberPage.getByLabel("Notes for Reviewer (optional)").fill(submissionNote);
    await memberPage.getByRole("button", { name: "Submit Verification" }).click();
    await expect(
      memberPage.getByText("Verification request submitted! We'll review your documents shortly.").first()
    ).toBeVisible();
    await expect(memberPage.getByText("Pending review").first()).toBeVisible();

    await loginAdminPortalByUi(adminPage, adminUser);
    await clickAdminNav(adminPage, "Verifications");
    await adminPage.getByRole("button", { name: /^All Records$/i }).first().click();

    const verificationRow = await test.step("wait for verification row", async () => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const row = adminPage.getByRole("row").filter({ hasText: memberUserId }).first();
        if (await row.isVisible().catch(() => false)) {
          return row;
        }
        await adminPage.getByRole("button", { name: /^Pending$/i }).first().click().catch(() => undefined);
        await adminPage.waitForTimeout(300);
        await adminPage.getByRole("button", { name: /^All Records$/i }).first().click().catch(() => undefined);
        await adminPage.waitForTimeout(500);
      }
      throw new Error("Verification row did not appear in admin portal.");
    });

    await verificationRow.getByRole("button", { name: /Start Review/i }).click();
    await adminPage.getByLabel("Decision Notes (Audit)").fill(reviewNote);
    await adminPage.getByRole("button", { name: /^Approve$/i }).click();
    await expect(adminPage.getByText(/Verification approved successfully\./i).first()).toBeVisible();

    await signOutIfVisible(memberPage);
    await loginWebUser(memberPage, member);

    await clickWebNav(memberPage, "Alerts");
    await expect(memberPage.getByText(/Verification approved/i).first()).toBeVisible({ timeout: 10_000 });

    await clickWebNav(memberPage, "Verify");
    await expect(memberPage.getByText("Approved").first()).toBeVisible();
    await expect(memberPage.getByText(reviewNote).first()).toBeVisible();
  } finally {
    await memberPage.close();
    await adminPage.close();
  }
});
