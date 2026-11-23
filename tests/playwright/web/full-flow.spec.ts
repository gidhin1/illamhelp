import { expect, Locator, Page, test } from "@playwright/test";

import {
  openSignedOutMemberHome,
  cardByHeading,
  E2eUser,
  makeUser,
  parseMemberId,
  readTextByTestId,
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
  const queueItem = await poll(async () => {
    if (page.isClosed()) {
      throw new Error("Admin page was closed before verification request appeared.");
    }

    const errorBanner = page.getByRole("main").getByRole("alert").first();
    if (await errorBanner.isVisible().catch(() => false)) {
      const errorText = (await errorBanner.innerText().catch(() => "Verification review failed")).trim();
      throw new Error(`Verification review failed: ${errorText}`);
    }

    const candidate = page
      .getByRole("region", { name: "Verification requests" })
      .getByRole("button")
      .filter({ hasText: memberUserId })
      .first();
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }

    await page.getByRole("button", { name: /^Pending$/i }).first().click().catch(() => undefined);
    await page.getByRole("button", { name: /^All statuses$/i }).first().click().catch(() => undefined);
    return undefined;
  }, timeoutMs);

  await queueItem.click();
  const review = page.getByTestId("verification-review-panel");
  await expect(review.getByText(memberUserId).first()).toBeVisible();
  await review.getByRole("button", { name: "Preview document", exact: true }).click();
  await expect(review.getByRole("img", { name: "Private verification document preview" }))
    .toHaveJSProperty("naturalWidth", 1);
  await review.getByLabel("Decision notes").fill(reviewNote);
  await review.getByRole("button", { name: decision === "approved" ? "Approve verification" : "Reject verification" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(reviewNote, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: decision === "approved" ? "Confirm approval" : "Confirm rejection" }).click();
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
    discover: /Discover jobs|Jobs from people/i,
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

function jobCard(page: Page, title: string): Locator {
  return page.locator("article").filter({ hasText: title }).first();
}

function personCard(page: Page, memberText: string): Locator {
  return page.locator("article").filter({ hasText: memberText }).first();
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
  await openSignedOutMemberHome(page, "/");
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
  const errorBanner = page.getByRole("main").getByRole("alert").first();

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
  await expect(page.getByLabel("Username or email")).toBeVisible();
}

async function registerByUi(page: Page, user: E2eUser): Promise<AuthSessionResponse> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await resetBrowserSession(page);
    await openAuthEntry(page, "register");
    await page.getByLabel("First name").fill(user.firstName);
    await page.getByLabel("Last name").fill(user.lastName);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Member ID").fill(user.username);
    await page.getByLabel("Phone (optional)").fill("+919876543210");
    await page.getByLabel("Password").fill(user.password);
    await page.getByLabel(/I agree to the current Terms and Conditions and Privacy Policy/i).check();

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
    await page.getByLabel("Username or email").fill(user.username);
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
  if (new URL(page.url()).pathname !== "/jobs/posted") {
    await openJobsSection(page, "posted");
  }
  await page.getByLabel("Category").fill(payload.category);
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
  await page.getByRole("button", { name: /Search people|Search/i }).click();

  const matchCard = page.getByRole("article").filter({ hasText: targetUserId }).first();

  await expect(matchCard).toBeVisible();
  await matchCard.getByRole("button", { name: "Send request", exact: true }).click();

  await waitForSuccessMessage(page, "Connection request sent.");
}

async function findConnectionRow(page: Page, otherUserId: string): Promise<Locator> {
  await clickMainNav(page, "People");
  const card = personCard(page, otherUserId);
  await expect(card).toBeVisible();
  return card;
}

async function selectOptionContaining(
  select: Locator,
  textFragment: string,
  timeoutMs = 10_000
): Promise<void> {
  const value = await poll(async () => {
    const options = await select.locator("option").evaluateAll((rows) =>
      rows.map((option) => {
        const cast = option as HTMLOptionElement;
        return {
          value: cast.value,
          text: cast.textContent?.trim() ?? ""
        };
      })
    );
    const normalized = textFragment.toLowerCase();
    const match = options.find(
      (item) => item.value && item.text.toLowerCase().includes(normalized)
    );
    if (!match) {
      const selectableOptions = options.filter((item) => item.value);
      if (selectableOptions.length === 1) {
        return selectableOptions[0].value;
      }
    }
    return match?.value;
  }, timeoutMs);

  await select.selectOption(value);
}

async function requestConsentAccessByUi(
  page: Page,
  ownerUserId: string,
  purpose: string
): Promise<void> {
  await clickMainNav(page, "Privacy");
  await page.getByRole("navigation", { name: "Contact sharing tasks" })
    .getByRole("button", { name: /^Request details\b/ }).click();
  const requestPanel = await cardByHeading(page, "Request contact details");
  const select = requestPanel.getByLabel("Who");
  await selectOptionContaining(select, ownerUserId);
  await requestPanel.getByLabel("Why").fill(purpose);
  await requestPanel.getByRole("button", { name: "Request contact details" }).click();
  await waitForSuccessMessage(page, "Contact request sent.");
}

async function grantConsentByUi(
  page: Page,
  requesterUserId: string,
  purpose: string
): Promise<void> {
  await clickMainNav(page, "Privacy");
  await page.getByRole("button", { name: /Requests/i }).click();
  const grantPanel = await cardByHeading(page, "Requests to see your details");
  const select = grantPanel.getByLabel("Choose a request to approve");
  await selectOptionContaining(select, requesterUserId);
  await grantPanel.getByLabel("Why are you sharing?").fill(purpose);
  const endsTomorrow = await page.evaluate(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16);
  });
  await grantPanel.getByLabel("Access end date and time (optional)").fill(endsTomorrow);
  await grantPanel.getByRole("button", { name: "Share selected details" }).click();
  await waitForSuccessMessage(page, "Contact details shared.");
}

async function revokeConsentByUi(
  page: Page,
  granteeUserId: string,
  reason: string
): Promise<void> {
  await clickMainNav(page, "Profile");
  await page.getByRole("link", { name: "Manage contact sharing" }).click();
  const target = page.getByRole("article").filter({ hasText: granteeUserId });
  await expect(target.getByText("Can see: Phone number")).toBeVisible();
  await target.getByRole("button", { name: "Review and stop sharing" }).click();
  await target.getByRole("button", { name: "Keep sharing" }).click();
  await expect(target.getByLabel("Reason for stopping")).toHaveCount(0);
  await target.getByRole("button", { name: "Review and stop sharing" }).click();
  await target.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await expect(target.getByText("Enter a reason with at least 3 characters.")).toBeVisible();
  await target.getByLabel("Reason for stopping").fill(reason);
  await target.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await waitForSuccessMessage(page, "Contact sharing stopped.");
  await expect(target).toHaveCount(0);
}

async function assertConsentVisibility(
  page: Page,
  ownerUserId: string,
  expected: "allowed" | "denied"
): Promise<void> {
  await clickMainNav(page, "Privacy");
  await page.getByRole("button", { name: /History/i }).click();
  const checkPanel = await cardByHeading(page, "Check if a detail is shared");
  const select = checkPanel.getByLabel("Connected person");
  await selectOptionContaining(select, ownerUserId);
  await checkPanel.getByLabel("Contact detail").selectOption("phone");
  await checkPanel.getByRole("button", { name: "Check access" }).click();
  await waitForSuccessMessage(page, "Sharing check completed.");

  if (expected === "allowed") {
    await expect(page.getByText("This person has shared this detail with you.").first()).toBeVisible();
    return;
  }

  await expect(page.getByText("This detail isn’t shared with you.").first()).toBeVisible();
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
      page.getByRole("heading", { name: /Review work/i }).first(),
      page.getByRole("heading", { name: /Review photos and videos/i }).first(),
      page.getByRole("heading", { name: /Review verification requests/i }).first(),
      page.getByRole("button", { name: /Run automated checks/i }).first(),
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
  test.setTimeout(45_000);
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
    const providerJobCard = jobCard(providerPage, jobTitle);
    await expect(providerJobCard).toBeVisible();
    await providerJobCard.getByRole("button", { name: "Apply for job" }).click();
    await providerPage.getByLabel("Message to the job poster").fill("I can help with this repair and arrive at the agreed time.");
    await providerPage.getByRole("button", { name: "Submit application" }).click();
    await waitForSuccessMessage(providerPage, "Application submitted.");

    await sendConnectionRequestByUi(providerPage, seekerUserId);

    const seekerConnectionRow = await findConnectionRow(seekerPage, providerUserId);
    await seekerConnectionRow.getByRole("button", { name: "Accept" }).click();
    await waitForSuccessMessage(seekerPage, "Connection accepted.");

    await openPostedJobDetail(seekerPage, jobTitle);
    await expect(seekerPage.getByRole("main").getByText(providerUserId, { exact: false }).first()).toBeVisible();
    await seekerPage.getByRole("button", { name: "Review assignment", exact: true }).click();
    await seekerPage.getByRole("button", { name: "Keep reviewing", exact: true }).click();
    await expect(seekerPage.getByRole("button", { name: "Assign job", exact: true })).toHaveCount(0);
    await seekerPage.getByRole("button", { name: "Review assignment", exact: true }).click();
    await seekerPage.getByRole("button", { name: "Assign job", exact: true }).click();
    await waitForSuccessMessage(seekerPage, "Job assigned.");

    await requestConsentAccessByUi(providerPage, seekerUserId, requestPurpose);
    await grantConsentByUi(seekerPage, providerUserId, grantPurpose);
    await assertConsentVisibility(providerPage, seekerUserId, "allowed");
    await revokeConsentByUi(seekerPage, providerUserId, "E2E revoke validation");
    await assertConsentVisibility(providerPage, seekerUserId, "denied");

    const providerConnectionRow = await findConnectionRow(providerPage, seekerUserId);
    await providerConnectionRow.getByRole("button", { name: "Block" }).click();
    await providerConnectionRow.getByRole("button", { name: "Block person", exact: true }).click();
    await waitForSuccessMessage(providerPage, "Person blocked.");
    await expect(personCard(providerPage, seekerUserId)).toHaveCount(0);
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
  await expect(personCard(page, requesterUserId)).toHaveCount(0);

  await signOutIfVisible(page);
  await loginByUi(page, requester);
  await sendConnectionRequestByUi(page, ownerUserId);

  await signOutIfVisible(page);
  await loginByUi(page, owner);
  const secondPendingRow = await findConnectionRow(page, requesterUserId);
  await secondPendingRow.getByRole("button", { name: "Accept" }).click();
  await waitForSuccessMessage(page, "Connection accepted.");

  const acceptedRow = await findConnectionRow(page, requesterUserId);
  await expect(acceptedRow.getByText("Connected", { exact: true })).toBeVisible();
  await acceptedRow.getByRole("button", { name: "Block" }).click();
  await expect(acceptedRow.getByText("This ends the connection and any contact sharing between you.")).toBeVisible();
  await acceptedRow.getByRole("button", { name: "Keep connection" }).click();
  await expect(acceptedRow.getByText("Connected", { exact: true })).toBeVisible();
  await acceptedRow.getByRole("button", { name: "Block" }).click();
  await acceptedRow.getByRole("button", { name: "Block person", exact: true }).click();
  await waitForSuccessMessage(page, "Person blocked.");
  await expect(personCard(page, requesterUserId)).toHaveCount(0);
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
      jobCard(providerPage, title)
    ).toHaveCount(0);

    await sendConnectionRequestByUi(providerPage, seekerUserId);

    const seekerConnectionRow = await findConnectionRow(seekerPage, providerUserId);
    await seekerConnectionRow.getByRole("button", { name: "Accept" }).click();
    await waitForSuccessMessage(seekerPage, "Connection accepted.");

    await openJobsSection(providerPage, "discover");
    await providerPage.getByRole("button", { name: "Refresh jobs" }).click();

    const connectedJobRow = await poll(async () => {
      const card = jobCard(providerPage, title);
      return (await card.isVisible().catch(() => false)) ? card : undefined;
    }, 10_000);
    await expect(connectedJobRow).toBeVisible();
    await connectedJobRow.getByRole("button", { name: "Apply for job" }).click();
    await providerPage.getByLabel("Message to the job poster").fill("I can complete this service through your trusted network.");
    await providerPage.getByRole("button", { name: "Submit application" }).click();
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
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "Post a job", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/posted#post-new-job$/);
  await expect(page.getByRole("heading", { name: "Post a new job" })).toBeInViewport();
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
  const publicJobCard = jobCard(page, jobTitle);
  await expect(publicJobCard).toBeVisible();
  await publicJobCard.getByRole("button", { name: "Apply for job" }).click();
  await page.getByLabel("Message to the job poster").fill("I can inspect and resolve this issue safely and promptly.");
  await page.getByRole("button", { name: "Submit application" }).click();
  await waitForSuccessMessage(page, "Application submitted.");

  await signOutIfVisible(page);
  await loginByUi(page, seeker);
  await openPostedJobDetail(page, jobTitle);
  await page.getByRole("button", { name: "Review assignment", exact: true }).first().click();
  await page.getByRole("button", { name: "Assign job", exact: true }).click();
  await waitForSuccessMessage(page, "Job assigned.");

  await signOutIfVisible(page);
  await loginByUi(page, provider);
  await openAssignedJobDetail(page, jobTitle);
  await page.getByRole("button", { name: "Start job" }).click();
  await waitForSuccessMessage(page, "Job started.");

  await signOutIfVisible(page);
  await loginByUi(page, seeker);
  await openPostedJobDetail(page, jobTitle);
  await page.getByRole("button", { name: "Mark work complete" }).click();
  await waitForSuccessMessage(page, "Work marked complete.");
  await page.getByRole("button", { name: "Mark as paid" }).click();
  await waitForSuccessMessage(page, "Payment marked as paid.");

  await signOutIfVisible(page);
  await loginByUi(page, provider);
  await openAssignedJobDetail(page, jobTitle);
  await page.getByRole("button", { name: "Confirm payment received" }).click();
  await waitForSuccessMessage(page, "Payment marked as received.");

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
    !process.env.E2E_ADMIN_USERNAME?.trim() || !process.env.E2E_ADMIN_PASSWORD?.trim(),
    "Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD to run admin verification review."
  );
  const member = makeUser("both");
  const adminUser = readAdminPortalUser();
  const shortId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const reviewNote = `Verification approved in E2E ${shortId}`;
  const submissionNote = `Verification submit note ${member.username}-${shortId}`;

  const memberPage = await browser.newPage();
  const adminPage = await browser.newPage();

  try {
    await loginToAdminPortalByUi(adminPage, adminUser);
    await clickAdminNav(adminPage, "Verifications");
    await expect(adminPage.getByRole("heading", { name: /Review verification requests/i }).first()).toBeVisible({
      timeout: 10_000
    });
    await adminPage.getByRole("button", { name: /^All statuses$/i }).first().click();

    const memberSession = await registerByUi(memberPage, member);
    const memberUserId = memberSession.userId;

    await clickMainNav(memberPage, "Verify");
    const submitVerification = memberPage.getByRole("button", { name: "Submit verification request" });
    await expect(submitVerification).toBeDisabled();
    await memberPage
      .getByLabel("Choose private verification document")
      .setInputFiles({
        name: "verification-document.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=",
          "base64"
        )
      });
    await memberPage.getByRole("button", { name: "Upload private document" }).click();
    await expect(memberPage.getByText("1 private document ready to submit.", { exact: true })).toBeVisible();
    await memberPage.reload();
    await expect(memberPage.getByText("1 private document ready to submit.", { exact: true })).toBeVisible();
    await expect(submitVerification).toBeEnabled();
    await memberPage
      .getByLabel("Notes for the reviewer (optional)")
      .fill(submissionNote);
    await memberPage.getByRole("button", { name: "Submit verification request" }).click();
    await waitForSuccessMessage(
      memberPage,
      "Request sent. Check this page for the review result."
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
    await expect(memberPage.getByText(/Your profile is verified/i).first()).toBeVisible({ timeout: 10_000 });

    await clickMainNav(memberPage, "Verify");
    await expect(memberPage.getByText("Approved").first()).toBeVisible();
    await expect(memberPage.getByText(reviewNote).first()).toBeVisible();
  } finally {
    await memberPage.close();
    await adminPage.close();
  }
});

test("web E2E application lifecycle: apply -> withdraw -> apply again", async ({ page }) => {
  test.setTimeout(45_000);
  const seeker = makeUser("seeker");
  const provider = makeUser("provider");
  const jobTitle = `Withdraw E2E ${Date.now().toString(36).slice(-5)}`;

  await registerByUi(page, seeker);
  await createJobByUi(page, {
    category: "plumber",
    locationText: "Kochi",
    title: jobTitle,
    description: "Need a provider for a plumbing repair appointment.",
    visibility: "public"
  });

  await signOutIfVisible(page);
  await registerByUi(page, provider);
  await openJobsSection(page, "discover");
  const targetJobCard = jobCard(page, jobTitle);
  await expect(targetJobCard).toBeVisible();

  await targetJobCard.getByRole("link", { name: "View details", exact: true }).click();
  await expect(page.getByRole("heading", { name: jobTitle, level: 1 })).toBeVisible();
  const message = page.getByLabel("Message to the job poster (optional)", { exact: true });
  await message.fill("abc");
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("Enter at least 4 characters, or leave the message blank.")).toBeVisible();
  await expect(message).toHaveValue("abc");
  await message.fill("");
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: "Your application", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to jobs" }).click();
  await expect(targetJobCard.getByRole("button", { name: "Withdraw application" })).toBeVisible();

  await targetJobCard.getByRole("button", { name: "Withdraw application" }).click();
  await waitForSuccessMessage(page, "Application withdrawn.");
  await expect(targetJobCard.getByRole("button", { name: "Apply for job" })).toBeVisible();

  await targetJobCard.getByRole("button", { name: "Apply for job" }).click();
  await page.getByLabel("Message to the job poster").fill("I remain available and can complete this job safely.");
  await page.getByRole("button", { name: "Submit application" }).click();
  await waitForSuccessMessage(page, "Application submitted.");
});

test("web E2E owner can cancel a posted job before assignment", async ({ page }) => {
  test.setTimeout(30_000);
  const seeker = makeUser("seeker");
  const jobTitle = `Cancel E2E ${Date.now().toString(36).slice(-5)}`;

  await registerByUi(page, seeker);
  await createJobByUi(page, {
    category: "cleaner",
    locationText: "Doha",
    title: jobTitle,
    description: "Need help with a scheduled home cleaning service.",
    visibility: "public"
  });

  const postedCard = jobCard(page, jobTitle);
  await expect(postedCard).toBeVisible();
  await postedCard.getByRole("button", { name: "Manage job" }).click();
  await expect(page.getByRole("heading", { name: jobTitle }).first()).toBeVisible();
  await page.getByRole("button", { name: "Review cancellation" }).click();
  await expect(page.getByText("Cancel this booking? Work on this booking will end.")).toBeVisible();
  await page.getByRole("button", { name: "Keep booking" }).click();
  await expect(page.getByText("Open for applications", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review cancellation" }).click();
  await page.getByLabel("Cancel reason (optional)").fill("Schedule changed before an assignment was made.");
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await waitForSuccessMessage(page, "Booking cancelled.");
  await expect(page.getByText("cancelled").first()).toBeVisible();
});
