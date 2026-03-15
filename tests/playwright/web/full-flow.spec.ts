import { expect, Locator, Page, test } from "@playwright/test";

import {
  cardByHeading,
  E2eUser,
  makeUser,
  parseMemberId,
  readTextByTestId,
  selectJobCategoryOption,
  waitForSuccessMessage
} from "../utils/flow-helpers";

const adminBaseUrl = process.env.PW_ADMIN_BASE_URL ?? "http://localhost:3103";

type AuthSessionResponse = {
  userId: string;
  accessToken: string;
};

type AdminPortalUser = {
  username: string;
  password: string;
};

function readAdminPortalUser(): AdminPortalUser {
  const username = process.env.E2E_ADMIN_USERNAME?.trim();
  const password = process.env.E2E_ADMIN_PASSWORD?.trim();

  if (!username || !password) {
    throw new Error("Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD for admin Playwright flows.");
  }

  return { username, password };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function poll<T>(action: () => Promise<T | undefined>, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await action();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out while polling data.");
}

async function reviewVerificationByUi(
  page: Page,
  memberUserId: string,
  reviewNote: string,
  decision: "approved" | "rejected",
  timeoutMs = 10_000
): Promise<void> {
  const row = await poll(async () => {
    if (page.isClosed()) {
      throw new Error("Admin page was closed before verification row appeared.");
    }

    const errorBanner = page.locator(".banner.error").first();
    if (await errorBanner.isVisible().catch(() => false)) {
      const errorText = (await errorBanner.innerText().catch(() => "Verification review failed")).trim();
      throw new Error(`Verification review failed: ${errorText}`);
    }

    const candidate = page.getByRole("row").filter({ hasText: memberUserId }).first();
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }

    await page.getByRole("button", { name: /^Pending$/i }).first().click().catch(() => undefined);
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /^All Records$/i }).first().click().catch(() => undefined);
    await page.waitForTimeout(500);
    return undefined;
  }, timeoutMs);

  await row.getByRole("button", { name: /Start Review/i }).click();
  await page.getByLabel("Decision Notes (Audit)").fill(reviewNote);
  await page
    .getByRole("button", { name: decision === "approved" ? /^Approve$/i : /^Reject$/i })
    .click();
  await expect(
    page
      .getByText(
        decision === "approved"
          ? /Verification approved successfully\./i
          : /Verification rejected successfully\./i
      )
      .first()
  ).toBeVisible();
}

async function gotoHome(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /IllamHelp/i }).first()).toBeVisible();
}

async function gotoAdminHome(page: Page): Promise<void> {
  await page.goto(`${adminBaseUrl}/`, { waitUntil: "domcontentloaded" });
}

async function clickMainNav(page: Page, label: string): Promise<void> {
  const candidates = label === "Jobs" ? ["Discover", "Jobs"] : [label];

  for (const candidate of candidates) {
    const link = page
      .getByRole("link", { name: new RegExp(`\\b${escapeRegex(candidate)}\\b`, "i") })
      .first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      return;
    }
  }

  throw new Error(`Main navigation link not found for label '${label}'.`);
}

async function openJobsSection(
  page: Page,
  section: "discover" | "posted" | "assigned"
): Promise<void> {
  await clickMainNav(page, "Jobs");

  const labels = {
    discover: "Discover",
    posted: "Posted by me",
    assigned: "Assigned to me"
  } as const;

  const expectedHeadings = {
    discover: /Discover jobs/i,
    posted: /Jobs posted by me/i,
    assigned: /Jobs assigned to me/i
  } as const;

  const targetLabel = labels[section];
  const targetLink = page.getByRole("link", { name: new RegExp(`^${escapeRegex(targetLabel)}$`, "i") }).first();
  await expect(targetLink).toBeVisible();

  if ((await targetLink.getAttribute("aria-current")) !== "page") {
    await targetLink.click();
  }

  await expect(page.getByRole("heading", { name: expectedHeadings[section] }).first()).toBeVisible();
}

async function clickAdminNav(page: Page, label: string): Promise<void> {
  await page
    .getByRole("link", { name: new RegExp(`\\b${escapeRegex(label)}\\b`, "i") })
    .first()
    .click();
}

async function signOutIfVisible(page: Page): Promise<void> {
  const signOut = page.getByRole("button", { name: "Sign out" }).first();
  if (await signOut.isVisible()) {
    await signOut.click();
  }
}

async function resetBrowserSession(page: Page): Promise<void> {
  await gotoHome(page);
  await signOutIfVisible(page);

  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = "illamhelp_access_token=; Path=/; Max-Age=0; SameSite=Lax";
  });

  await page.context().clearCookies();
  await gotoHome(page);
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
  responsePromise: Promise<import("@playwright/test").Response | null>,
  action: "register" | "login"
): Promise<AuthSessionResponse> {
  const response = await responsePromise;
  if (!response) {
    throw new Error(`Auth ${action} request was not fired from UI.`);
  }
  if (response.ok()) {
    return (await response.json()) as AuthSessionResponse;
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

function isAuthRateLimitedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("http 429") || message.includes("too many authentication attempts");
}

async function waitForAuthRateLimitBackoff(page: Page, attempt: number): Promise<void> {
  const waitMs = Math.min(20_000, 2_500 * attempt);
  await page.waitForTimeout(waitMs);
}

async function waitForAuthRedirectOrError(page: Page, expectedUrl: RegExp): Promise<void> {
  const timeoutMs = 10_000;
  const started = Date.now();
  const errorBanner = page.locator(".banner.error").first();

  while (Date.now() - started < timeoutMs) {
    if (expectedUrl.test(page.url())) {
      return;
    }

    if (await errorBanner.isVisible().catch(() => false)) {
      const message = await errorBanner.innerText();
      throw new Error(`Auth flow failed: ${message}`);
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Auth flow timed out. Current URL: ${page.url()}`);
}

async function openAuthEntry(page: Page, mode: "register" | "login"): Promise<void> {
  await gotoHome(page);
  if (mode === "register") {
    const registerLink = page
      .getByRole("link", { name: /join now|sign up|create account|register/i })
      .first();
    await registerLink.click();
    await expect(page.getByLabel("First name")).toBeVisible();
    return;
  }

  const signInLink = page
    .getByRole("link", { name: /sign in/i })
    .first();
  await signInLink.click();
  await expect(page.getByLabel("Username or Email")).toBeVisible();
}

async function registerByUi(page: Page, user: E2eUser): Promise<AuthSessionResponse> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await resetBrowserSession(page);
    await openAuthEntry(page, "register");
    await page.getByLabel("First name").fill(user.firstName);
    await page.getByLabel("Last name").fill(user.lastName);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("User ID").fill(user.username);
    await page.getByLabel("Phone (optional)").fill("+919876543210");
    await page.getByLabel("Password").fill(user.password);

    const submitButton = page.locator("form button[type='submit']").first();
    const responsePromise = waitForAuthResponse(page, "/auth/register", "POST");
    await submitButton.click();
    try {
      const session = await assertAuthResponse(responsePromise, "register");
      await waitForAuthRedirectOrError(page, /\/jobs$/);
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

async function loginByUi(page: Page, user: E2eUser): Promise<AuthSessionResponse> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await resetBrowserSession(page);
    await openAuthEntry(page, "login");
    await page.getByLabel("Username or Email").fill(user.username);
    await page.getByLabel("Password").fill(user.password);

    const submitButton = page.locator("form button[type='submit']").first();
    const responsePromise = waitForAuthResponse(page, "/auth/login", "POST");
    await submitButton.click();
    try {
      const session = await assertAuthResponse(responsePromise, "login");
      await waitForAuthRedirectOrError(page, /\/jobs$/);
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

async function readCurrentUserId(page: Page): Promise<string> {
  await clickMainNav(page, "Profile");
  return parseMemberId(await readTextByTestId(page, "profile-user-id"), "current profile user id");
}

async function createJobByUi(
  page: Page,
  payload: {
    category: string;
    locationText: string;
    title: string;
    description: string;
    visibility?: "public" | "connections_only";
  }
): Promise<void> {
  await openJobsSection(page, "posted");
  const categorySelect = page.getByRole("combobox", { name: /Category/i }).first();
  const selectionMode = await selectJobCategoryOption(categorySelect, payload.category);
  if (selectionMode === "custom") {
    await page.getByLabel("Custom category").fill(payload.category);
  }
  await page.getByLabel("Location").fill(payload.locationText);
  await page.getByLabel("Title").fill(payload.title);
  await page.getByLabel("Description").fill(payload.description);

  if (payload.visibility) {
    const visibilitySelect = page.getByRole("combobox", { name: /Visibility/i }).first();
    await visibilitySelect.selectOption(payload.visibility);
  }

  await page.getByRole("button", { name: "Post job" }).click();
  await waitForSuccessMessage(page, "Job posted successfully.");
}

async function sendConnectionRequestByUi(page: Page, targetUserId: string): Promise<void> {
  await clickMainNav(page, "People");
  await page.getByLabel("Find a person").fill(targetUserId);
  await page.getByRole("button", { name: "Search" }).click();

  const matchCard = page
    .locator(".card")
    .filter({ hasText: targetUserId })
    .first();

  if (await matchCard.isVisible().catch(() => false)) {
    await matchCard.getByRole("button", { name: /Request connection/i }).click();
  } else {
    await page.getByRole("button", { name: "Send request" }).click();
  }

  await waitForSuccessMessage(page, "Connection request sent.");
}

async function findConnectionRow(page: Page, otherUserId: string): Promise<Locator> {
  await clickMainNav(page, "People");
  await page.getByRole("button", { name: "Connections" }).click();
  const card = page.locator(".card").filter({ hasText: new RegExp(escapeRegex(otherUserId), "i") }).first();
  await expect(card).toBeVisible();
  return card;
}

async function requestConsentAccessByUi(
  page: Page,
  ownerUserId: string,
  purpose: string
): Promise<void> {
  await clickMainNav(page, "Privacy");
  await page.getByTestId(`privacy-connection-card-${ownerUserId}`).click();
  await page.getByTestId("privacy-tab-mine").click();
  await page.getByTestId("privacy-request-purpose").fill(purpose);
  await page.getByRole("button", { name: "Request access" }).click();
  await waitForSuccessMessage(page, "Access request submitted.");
}

async function grantConsentByUi(
  page: Page,
  requesterUserId: string,
  requestPurpose: string,
  purpose: string
): Promise<void> {
  await clickMainNav(page, "Privacy");
  await page.getByTestId(`privacy-connection-card-${requesterUserId}`).click();
  await page.getByTestId("privacy-tab-theirs").click();
  await page
    .locator("[data-testid^='privacy-their-request-']")
    .filter({ hasText: new RegExp(escapeRegex(requestPurpose), "i") })
    .first()
    .click();
  await page.getByLabel("Grant purpose").fill(purpose);
  await page.getByRole("button", { name: "Grant access" }).click();
  await waitForSuccessMessage(page, "Access granted.");
}

async function revokeConsentByUi(
  page: Page,
  granteeUserId: string,
  grantPurpose: string,
  reason: string
): Promise<void> {
  await clickMainNav(page, "Privacy");
  await page.getByTestId(`privacy-connection-card-${granteeUserId}`).click();
  await page.getByTestId("privacy-tab-theirs").click();
  await page
    .locator("[data-testid^='privacy-revoke-grant-']")
    .filter({ hasText: new RegExp(escapeRegex(grantPurpose), "i") })
    .first()
    .click();
  await page.getByLabel("Revoke reason (optional)").fill(reason);
  await page.getByRole("button", { name: "Revoke selected grant" }).click();
  await waitForSuccessMessage(page, "Access revoked.");
}

async function assertConsentVisibility(
  page: Page,
  ownerUserId: string,
  expected: "allowed" | "denied"
): Promise<void> {
  await clickMainNav(page, "Privacy");
  await page.getByTestId(`privacy-connection-card-${ownerUserId}`).click();
  await page.getByTestId("privacy-tab-current").click();

  const phoneRow = page.getByTestId("privacy-field-row-phone");
  const currentAccessCell = phoneRow.locator("td").nth(1);
  if (expected === "allowed") {
    await expect(currentAccessCell).toContainText("Visible");
    return;
  }

  await expect(currentAccessCell).toContainText("Not shared");
}

async function openPostedJobDetail(page: Page, title: string): Promise<void> {
  await openJobsSection(page, "posted");
  await page.getByRole("link", { name: title }).first().click();
  await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
}

async function openAssignedJobDetail(page: Page, title: string): Promise<void> {
  await openJobsSection(page, "assigned");
  await page.getByRole("link", { name: title }).first().click();
  await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
}

async function loginToAdminPortalByUi(page: Page, user: AdminPortalUser): Promise<void> {
  await gotoAdminHome(page);
  const signOut = page.getByRole("button", { name: "Sign out" }).first();
  if (await signOut.isVisible().catch(() => false)) {
    await signOut.click();
  }

  const userInput = page.getByLabel("Username or email");
  if (!(await userInput.isVisible().catch(() => false))) {
    await page.getByRole("link", { name: /sign in/i }).first().click();
  }

  await expect(userInput).toBeVisible({ timeout: 10_000 });
  await userInput.fill(user.username);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("main").getByRole("button", { name: /^Sign in$/i }).click();

  await poll(async () => {
    if (page.url().includes("/auth/login")) {
      return undefined;
    }

    const readyLocators = [
      page.getByRole("heading", { name: /Operations Dashboard/i }).first(),
      page.getByRole("heading", { name: /Moderation Queue/i }).first(),
      page.getByRole("heading", { name: /Verification Processing/i }).first(),
      page.getByRole("button", { name: /Run Machine Checks/i }).first(),
      page.getByRole("button", { name: /sign out/i }).first()
    ];

    for (const locator of readyLocators) {
      if (await locator.isVisible().catch(() => false)) {
        return true;
      }
    }

    return undefined;
  }, 10_000);
}

test("web UI full flow: auth -> jobs -> connections -> consent", async ({ browser }) => {
  test.setTimeout(120_000);
  const seeker = makeUser("seeker");
  const provider = makeUser("provider");
  const webBaseUrl = process.env.PW_WEB_BASE_URL ?? "http://localhost:3100";
  const seekerContext = await browser.newContext({ baseURL: webBaseUrl });
  const providerContext = await browser.newContext({ baseURL: webBaseUrl });
  const seekerPage = await seekerContext.newPage();
  const providerPage = await providerContext.newPage();

  const shortId = Date.now().toString(36).slice(-4);
  const jobTitle = `E2E job ${shortId}`;
  const requestPurpose = `E2E req ${shortId}`;
  const grantPurpose = `E2E grant ${shortId}`;

  try {
    await registerByUi(seekerPage, seeker);
    const seekerUserId = await readCurrentUserId(seekerPage);

    await createJobByUi(seekerPage, {
      category: "plumber",
      locationText: "Kakkanad, Kochi",
      title: jobTitle,
      description: "Need urgent support for kitchen sink leakage in apartment."
    });
    await expect(seekerPage.getByText(jobTitle).first()).toBeVisible();

    await registerByUi(providerPage, provider);
    const providerUserId = await readCurrentUserId(providerPage);

    await openJobsSection(providerPage, "discover");
    const providerJobRow = providerPage
      .getByRole("row", { name: new RegExp(escapeRegex(jobTitle), "i") })
      .first();
    await expect(providerJobRow).toBeVisible();
    await providerJobRow.getByRole("button", { name: "Apply" }).click();
    await waitForSuccessMessage(providerPage, "Application submitted.");

    await sendConnectionRequestByUi(providerPage, seekerUserId);

    const seekerConnectionRow = await findConnectionRow(seekerPage, providerUserId);
    await seekerConnectionRow.getByRole("button", { name: "Accept" }).click();
    await waitForSuccessMessage(seekerPage, "Connection accepted.");

    await openPostedJobDetail(seekerPage, jobTitle);
    const providerApplicantCard = seekerPage
      .locator(".card")
      .filter({ hasText: providerUserId })
      .filter({ hasText: "applied" })
      .first();
    await expect(providerApplicantCard).toBeVisible();
    await providerApplicantCard.getByRole("button", { name: "Approve applicant" }).click();
    await waitForSuccessMessage(seekerPage, "Applicant approved. Booking lifecycle is now active.");

    await requestConsentAccessByUi(providerPage, seekerUserId, requestPurpose);
    await grantConsentByUi(seekerPage, providerUserId, requestPurpose, grantPurpose);
    await assertConsentVisibility(providerPage, seekerUserId, "allowed");
    await revokeConsentByUi(seekerPage, providerUserId, grantPurpose, "E2E revoke validation");
    await assertConsentVisibility(providerPage, seekerUserId, "denied");

    const providerConnectionRow = await findConnectionRow(providerPage, seekerUserId);
    await providerConnectionRow.getByRole("button", { name: "Block" }).click();
    await waitForSuccessMessage(providerPage, "Person blocked.");
    await expect(providerPage.getByText("No accepted connections yet").first()).toBeVisible();
  } finally {
    await seekerContext.close();
    await providerContext.close();
  }
});

test("web E2E connection lifecycle: decline -> re-request -> accept -> block", async ({
  page
}) => {
  test.setTimeout(45_000);
  const requester = makeUser("both");
  const owner = makeUser("both");

  await registerByUi(page, requester);
  const requesterUserId = await readCurrentUserId(page);

  await signOutIfVisible(page);
  await registerByUi(page, owner);
  const ownerUserId = await readCurrentUserId(page);

  await signOutIfVisible(page);
  await loginByUi(page, requester);
  await sendConnectionRequestByUi(page, ownerUserId);

  await signOutIfVisible(page);
  await loginByUi(page, owner);
  const firstPendingRow = await findConnectionRow(page, requesterUserId);
  await firstPendingRow.getByRole("button", { name: "Decline" }).click();
  await waitForSuccessMessage(page, "Connection request declined.");
  await expect(page.getByText("No pending requests").first()).toBeVisible();

  await signOutIfVisible(page);
  await loginByUi(page, requester);
  await sendConnectionRequestByUi(page, ownerUserId);

  await signOutIfVisible(page);
  await loginByUi(page, owner);
  const secondPendingRow = await findConnectionRow(page, requesterUserId);
  await secondPendingRow.getByRole("button", { name: "Accept" }).click();
  await waitForSuccessMessage(page, "Connection accepted.");

  const acceptedRow = await findConnectionRow(page, requesterUserId);
  await expect(acceptedRow).toContainText(requesterUserId);
  await acceptedRow.getByRole("button", { name: "Block" }).click();
  await waitForSuccessMessage(page, "Person blocked.");
  await expect(page.getByText("No accepted connections yet").first()).toBeVisible();
});

test("web E2E jobs visibility: connections_only blocks non-connections", async ({ browser }) => {
  test.setTimeout(45_000);
  const seeker = makeUser("both");
  const provider = makeUser("both");
  const webBaseUrl = process.env.PW_WEB_BASE_URL ?? "http://localhost:3100";
  const seekerContext = await browser.newContext({ baseURL: webBaseUrl });
  const providerContext = await browser.newContext({ baseURL: webBaseUrl });
  const seekerPage = await seekerContext.newPage();
  const providerPage = await providerContext.newPage();
  const shortId = Date.now().toString(36).slice(-4);
  const title = `Connections only ${shortId}`;

  try {
    await registerByUi(seekerPage, seeker);
    const seekerUserId = await readCurrentUserId(seekerPage);

    await createJobByUi(seekerPage, {
      category: "plumber",
      locationText: "Kochi, Kakkanad",
      title,
      description: "Connections-only job posting for visibility access checks.",
      visibility: "connections_only"
    });

    await registerByUi(providerPage, provider);
    const providerUserId = await readCurrentUserId(providerPage);

    await openJobsSection(providerPage, "discover");
    await expect(
      providerPage.getByRole("row", { name: new RegExp(escapeRegex(title), "i") })
    ).toHaveCount(0);

    await sendConnectionRequestByUi(providerPage, seekerUserId);

    const seekerConnectionRow = await findConnectionRow(seekerPage, providerUserId);
    await seekerConnectionRow.getByRole("button", { name: "Accept" }).click();
    await waitForSuccessMessage(seekerPage, "Connection accepted.");

    await openJobsSection(providerPage, "discover");
    await providerPage.getByRole("button", { name: "Refresh list" }).click();

    const connectedJobRow = await poll(async () => {
      const row = providerPage.getByRole("row", { name: new RegExp(escapeRegex(title), "i") }).first();
      return (await row.isVisible().catch(() => false)) ? row : undefined;
    }, 10_000);
    await expect(connectedJobRow).toBeVisible();
    await connectedJobRow.getByRole("button", { name: "Apply" }).click();
    await waitForSuccessMessage(providerPage, "Application submitted.");
  } finally {
    await seekerContext.close();
    await providerContext.close();
  }
});

test("web E2E booking lifecycle: apply -> accept -> in_progress -> completed -> payment -> closed", async ({
  page
}) => {
  test.setTimeout(45_000);
  const seeker = makeUser("seeker");
  const provider = makeUser("provider");
  const shortId = Date.now().toString(36).slice(-4);
  const jobTitle = `Booking E2E ${shortId}`;

  await registerByUi(page, seeker);
  await createJobByUi(page, {
    category: "electrician",
    locationText: "Kakkanad, Kochi",
    title: jobTitle,
    description: "Need an electrician to inspect repeated power trip in kitchen.",
    visibility: "public"
  });

  await signOutIfVisible(page);
  await registerByUi(page, provider);
  await openJobsSection(page, "discover");
  const publicJobRow = page.getByRole("row", { name: new RegExp(escapeRegex(jobTitle), "i") }).first();
  await expect(publicJobRow).toBeVisible();
  await publicJobRow.getByRole("button", { name: "Apply" }).click();
  await waitForSuccessMessage(page, "Application submitted.");

  await signOutIfVisible(page);
  await loginByUi(page, seeker);
  await openPostedJobDetail(page, jobTitle);
  await page.getByRole("button", { name: "Approve applicant" }).first().click();
  await waitForSuccessMessage(page, "Applicant approved. Booking lifecycle is now active.");

  await signOutIfVisible(page);
  await loginByUi(page, provider);
  await openAssignedJobDetail(page, jobTitle);
  await page.getByRole("button", { name: "Start job" }).click();
  await waitForSuccessMessage(page, "Job started.");

  await signOutIfVisible(page);
  await loginByUi(page, seeker);
  await openPostedJobDetail(page, jobTitle);
  await page.getByRole("button", { name: "Mark completed" }).click();
  await waitForSuccessMessage(page, "Job marked completed.");
  await page.getByRole("button", { name: "Mark payment done" }).click();
  await waitForSuccessMessage(page, "Payment marked done.");

  await signOutIfVisible(page);
  await loginByUi(page, provider);
  await openAssignedJobDetail(page, jobTitle);
  await page.getByRole("button", { name: "Mark payment received" }).click();
  await waitForSuccessMessage(page, "Payment marked received.");

  await signOutIfVisible(page);
  await loginByUi(page, seeker);
  await openPostedJobDetail(page, jobTitle);
  await page.getByRole("button", { name: "Close job" }).click();
  await waitForSuccessMessage(page, "Job closed.");
  await expect(page.getByText("closed").first()).toBeVisible();
});

test("web E2E verification lifecycle: submit -> admin review -> user notification", async ({
  browser
}) => {
  test.setTimeout(45_000);
  test.skip(
    !process.env.E2E_ADMIN_USERNAME || !process.env.E2E_ADMIN_PASSWORD,
    "Admin E2E credentials are required for the verification cross-surface flow."
  );
  const member = makeUser("both");
  const adminUser = readAdminPortalUser();
  const shortId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const reviewNote = `Verification approved in E2E ${shortId}`;
  const submissionNote = `Verification submit note ${member.username}-${shortId}`;
  const documentMediaId = "11111111-1111-4111-8111-111111111111";

  const memberPage = await browser.newPage();
  const adminPage = await browser.newPage();

  try {
    await loginToAdminPortalByUi(adminPage, adminUser);
    await clickAdminNav(adminPage, "Verifications");
    await expect(adminPage.getByRole("heading", { name: /Verification Processing/i }).first()).toBeVisible({
      timeout: 10_000
    });
    await adminPage.getByRole("button", { name: /^All Records$/i }).first().click();

    const memberSession = await registerByUi(memberPage, member);
    const memberUserId = memberSession.userId;

    await clickMainNav(memberPage, "Verify");
    await memberPage.getByLabel("Document media IDs").fill(documentMediaId);
    await memberPage
      .getByLabel("Notes for Reviewer (optional)")
      .fill(submissionNote);
    await memberPage.getByRole("button", { name: "Submit Verification" }).click();
    await waitForSuccessMessage(
      memberPage,
      "Verification request submitted! We'll review your documents shortly."
    );
    await expect(memberPage.getByText("Pending review").first()).toBeVisible();

    await reviewVerificationByUi(
      adminPage,
      memberUserId,
      reviewNote,
      "approved"
    );

    await signOutIfVisible(memberPage);
    await loginByUi(memberPage, member);

    await clickMainNav(memberPage, "Alerts");
    await expect(memberPage.getByText(/Verification approved/i).first()).toBeVisible({ timeout: 10_000 });

    await clickMainNav(memberPage, "Verify");
    await expect(memberPage.getByText("Approved").first()).toBeVisible();
    await expect(memberPage.getByText(reviewNote).first()).toBeVisible();
  } finally {
    await memberPage.close();
    await adminPage.close();
  }
});
