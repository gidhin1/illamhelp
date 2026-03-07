import { expect, Locator, Page, test } from "@playwright/test";

import {
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

async function poll<T>(action: () => Promise<T | undefined>, timeoutMs = 30_000): Promise<T> {
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
  submissionNote: string,
  reviewNote: string,
  decision: "approved" | "rejected",
  timeoutMs = 90_000
): Promise<void> {
  const getVerificationCards = async (): Promise<Locator> => {
    const tagged = page.locator("[data-testid^='verification-card-']");
    if ((await tagged.count().catch(() => 0)) > 0) {
      return tagged;
    }
    return page.locator(".card");
  };

  const findVisibleAnyCardByText = async (text: string): Promise<Locator | undefined> => {
    const cards = await getVerificationCards();
    const matches = cards.filter({ hasText: text });
    const count = await matches.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = matches.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
    return undefined;
  };

  const findVisibleCardByText = async (text: string): Promise<Locator | undefined> => {
    const cards = await getVerificationCards();
    const matches = cards
      .filter({ hasText: text })
      .filter({ has: page.getByRole("button", { name: /^Review$/i }) });
    const count = await matches.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = matches.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
    return undefined;
  };

  const deadline = Date.now() + timeoutMs;
  let toggleAll = true;

  while (Date.now() < deadline) {
    if (page.isClosed()) {
      throw new Error("Admin page was closed before verification card appeared.");
    }

    if (await page.getByText("Admin access required").first().isVisible().catch(() => false)) {
      throw new Error("Admin portal denied access while waiting for verification card.");
    }

    const candidate = await findVisibleCardByText(submissionNote);
    if (candidate) {
      try {
        const reviewButtonByTestId = candidate.locator("[data-testid^='verification-review-']").first();
        if (await reviewButtonByTestId.isVisible().catch(() => false)) {
          await reviewButtonByTestId.click();
        } else {
          await candidate.getByRole("button", { name: /^Review$/i }).click();
        }

        const activeCard = await findVisibleAnyCardByText(submissionNote);
        if (!activeCard) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }

        const activeCardTestId = await activeCard.getAttribute("data-testid");
        const reviewedId =
          activeCardTestId && activeCardTestId.startsWith("verification-card-")
            ? activeCardTestId.slice("verification-card-".length)
            : undefined;

        const cardNotesInput = activeCard
          .getByPlaceholder("Reason for approval or rejection...")
          .first();
        await expect(cardNotesInput).toBeVisible({ timeout: 5_000 });
        await cardNotesInput.fill(reviewNote);

        const dataTestIdPrefix =
          decision === "approved" ? "[data-testid^='verification-approve-']" : "[data-testid^='verification-reject-']";
        const dataTestButton = activeCard.locator(dataTestIdPrefix).first();
        const legacyActionName =
          decision === "approved" ? /^(\s*✅\s*)?Approve$/i : /^(\s*❌\s*)?Reject$/i;
        const actionButton = (await dataTestButton.isVisible().catch(() => false))
          ? dataTestButton
          : activeCard
            .getByRole("button", { name: legacyActionName })
            .first();

        await actionButton.click();

        const completionDeadline = Date.now() + 15_000;
        while (Date.now() < completionDeadline) {
          const errorBanner = page.locator(".banner.error").first();
          if (await errorBanner.isVisible().catch(() => false)) {
            const errorText = (await errorBanner.innerText().catch(() => "Review failed")).trim();
            throw new Error(`Verification review failed: ${errorText}`);
          }

          const successMessage = page
            .getByText(decision === "approved" ? /Verification approved/i : /Verification rejected/i)
            .first();
          if (await successMessage.isVisible().catch(() => false)) {
            return;
          }

          const stillReviewable = await findVisibleCardByText(submissionNote);
          if (!stillReviewable) {
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 350));
        }

        if (decision === "approved") {
          await page.getByRole("button", { name: /Approved/i }).first().click().catch(() => undefined);
          const approvedDeadline = Date.now() + 25_000;
          while (Date.now() < approvedDeadline) {
            const errorBanner = page.locator(".banner.error").first();
            if (await errorBanner.isVisible().catch(() => false)) {
              const errorText = (await errorBanner.innerText().catch(() => "Review failed")).trim();
              throw new Error(`Verification review failed: ${errorText}`);
            }

            await page.getByRole("button", { name: /Refresh/i }).first().click().catch(() => undefined);
            const approvedCard =
              reviewedId && (await page.getByTestId(`verification-card-${reviewedId}`).first().isVisible().catch(() => false))
                ? page.getByTestId(`verification-card-${reviewedId}`).first()
                : await findVisibleAnyCardByText(submissionNote);
            if (approvedCard) {
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
        }

        throw new Error(`Verification review did not complete for note '${submissionNote}' within timeout.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const lower = message.toLowerCase();
        if (
          lower.includes("not attached") ||
          lower.includes("has been detached") ||
          lower.includes("target closed")
        ) {
          // Reacquire in next loop iteration.
        } else {
          throw error;
        }
      }
    }

    await page.getByRole("button", { name: /Refresh/i }).first().click().catch(() => undefined);

    // Force a refetch of the list by toggling filter state.
    const allButton = page.getByRole("button", { name: /^All$/i }).first();
    const pendingButton = page.getByRole("button", { name: /Pending/i }).first();
    if (
      (await allButton.isVisible().catch(() => false)) &&
      (await pendingButton.isVisible().catch(() => false))
    ) {
      if (toggleAll) {
        await allButton.click().catch(() => undefined);
      } else {
        await pendingButton.click().catch(() => undefined);
      }
      toggleAll = !toggleAll;
    } else {
      await page.reload({ waitUntil: "domcontentloaded" });
    }

    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  throw new Error(
    `Verification card not actionable for submission note '${submissionNote}'.`
  );
}

async function gotoHome(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /IllamHelp/i }).first()).toBeVisible();
}

async function gotoAdminHome(page: Page): Promise<void> {
  await page.goto(`${adminBaseUrl}/`);
  await expect(page.getByRole("link", { name: /IllamHelp/i }).first()).toBeVisible();
}

async function clickMainNav(page: Page, label: string): Promise<void> {
  await page
    .locator("header nav")
    .getByRole("link", { name: new RegExp(`^${escapeRegex(label)}\\b`, "i") })
    .first()
    .click();
}

async function clickAdminNav(page: Page, label: string): Promise<void> {
  await page
    .locator("header nav")
    .getByRole("link", { name: new RegExp(`^${escapeRegex(label)}\\b`, "i") })
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
      { timeout: 15_000 }
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
  const timeoutMs = 30_000;
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
      .getByRole("link", { name: /create account|register/i })
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
  await clickMainNav(page, "Jobs");
  await page.getByLabel("Category").fill(payload.category);
  await page.getByLabel("Location text").fill(payload.locationText);
  await page.getByLabel("Title").fill(payload.title);
  await page.getByLabel("Description").fill(payload.description);

  if (payload.visibility) {
    const visibilitySelect = page.getByRole("combobox", { name: /^Visibility$/ }).first();
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
    .filter({ hasText: `Member ID: ${targetUserId}` })
    .first();

  if (await matchCard.isVisible().catch(() => false)) {
    await matchCard.getByRole("button", { name: "Connect" }).click();
  } else {
    await page.getByRole("button", { name: "Send request" }).click();
  }

  await waitForSuccessMessage(page, "Connection request sent.");
}

async function findConnectionRow(page: Page, otherUserId: string): Promise<Locator> {
  await clickMainNav(page, "People");
  const currentConnectionsCard = await cardByHeading(page, "Current connections");
  const row = currentConnectionsCard
    .locator("div.grid.two > .card")
    .filter({ hasText: `Other user: ${otherUserId}` })
    .first();
  await expect(row).toBeVisible();
  return row;
}

async function selectOptionContaining(
  select: Locator,
  textFragment: string,
  timeoutMs = 30_000
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
  const requestCard = await cardByHeading(page, "Request access");
  const select = requestCard.getByLabel("Choose person");
  await selectOptionContaining(select, ownerUserId);
  await requestCard.getByLabel("Why you need this").fill(purpose);
  await requestCard.getByRole("button", { name: "Request access" }).click();
  await waitForSuccessMessage(page, "Access request submitted.");
}

async function grantConsentByUi(
  page: Page,
  requesterUserId: string,
  purpose: string
): Promise<void> {
  await clickMainNav(page, "Privacy");
  const grantCard = await cardByHeading(page, "Grant access");
  const select = grantCard.getByLabel("Pending request");
  await selectOptionContaining(select, requesterUserId);
  await grantCard.getByLabel("Why you are approving").fill(purpose);
  await grantCard.getByRole("button", { name: "Grant" }).click();
  await waitForSuccessMessage(page, "Access granted.");
}

async function revokeConsentByUi(
  page: Page,
  granteeUserId: string,
  reason: string
): Promise<void> {
  await clickMainNav(page, "Privacy");
  const revokeCard = await cardByHeading(page, "Stop sharing");
  const select = revokeCard.getByLabel("Active share");
  await selectOptionContaining(select, granteeUserId);
  await revokeCard.getByLabel("Reason").fill(reason);
  await revokeCard.getByRole("button", { name: "Revoke" }).click();
  await waitForSuccessMessage(page, "Access revoked.");
}

async function assertConsentVisibility(
  page: Page,
  ownerUserId: string,
  expected: "allowed" | "denied"
): Promise<void> {
  await clickMainNav(page, "Privacy");
  const checkCard = await cardByHeading(page, "Check shared access");
  const select = checkCard.getByLabel("Choose person");
  await selectOptionContaining(select, ownerUserId);
  await checkCard.getByLabel("Contact detail").selectOption("phone");
  await checkCard.getByRole("button", { name: "Check access" }).click();
  await waitForSuccessMessage(page, "Visibility check completed.");

  if (expected === "allowed") {
    await expect(page.getByText("This contact detail is available to you.").first()).toBeVisible();
    return;
  }

  await expect(
    page.getByText("This contact detail is not available right now.").first()
  ).toBeVisible();
}

async function openPostedJobDetail(page: Page, title: string): Promise<void> {
  await clickMainNav(page, "Jobs");
  const postedByMeCard = await cardByHeading(page, "Jobs posted by me");
  const jobCard = postedByMeCard.locator(".card").filter({ hasText: title }).first();
  await expect(jobCard).toBeVisible();

  const manageButton = jobCard
    .getByRole("button", { name: /Manage applicants|Manage job\/applicant/i })
    .first();
  await manageButton.click();
  await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
}

async function openAssignedJobDetail(page: Page, title: string): Promise<void> {
  await clickMainNav(page, "Jobs");
  const assignedCard = await cardByHeading(page, "Jobs assigned to me");
  const jobCard = assignedCard.locator(".card").filter({ hasText: title }).first();
  await expect(jobCard).toBeVisible();
  await jobCard.getByRole("button", { name: "View details" }).click();
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

  await expect(userInput).toBeVisible({ timeout: 20_000 });
  await userInput.fill(user.username);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("main").getByRole("button", { name: /^Sign in$/i }).click();

  await expect(page.getByTestId("admin-role-pill").first()).toContainText("Admin Access", {
    timeout: 30_000
  });
}

test("web UI full flow: auth -> jobs -> connections -> consent", async ({ page }) => {
  const seeker = makeUser("seeker");
  const provider = makeUser("provider");

  const shortId = Date.now().toString(36).slice(-4);
  const jobTitle = `E2E job ${shortId}`;
  const requestPurpose = `E2E req ${shortId}`;
  const grantPurpose = `E2E grant ${shortId}`;

  await registerByUi(page, seeker);
  const seekerUserId = await readCurrentUserId(page);

  await createJobByUi(page, {
    category: "plumber",
    locationText: "Kakkanad, Kochi",
    title: jobTitle,
    description: "Need urgent support for kitchen sink leakage in apartment."
  });
  await expect(page.getByText(jobTitle).first()).toBeVisible();

  await signOutIfVisible(page);
  await registerByUi(page, provider);
  const providerUserId = await readCurrentUserId(page);

  await clickMainNav(page, "Jobs");
  const publicJobsCard = await cardByHeading(page, "Public jobs");
  const providerJobCard = publicJobsCard.locator(".card").filter({ hasText: jobTitle }).first();
  await expect(providerJobCard).toBeVisible();
  await providerJobCard.getByRole("button", { name: "Apply for job" }).click();
  await waitForSuccessMessage(page, "Application submitted.");

  await sendConnectionRequestByUi(page, seekerUserId);

  await signOutIfVisible(page);
  await loginByUi(page, seeker);

  const seekerConnectionRow = await findConnectionRow(page, providerUserId);
  await seekerConnectionRow.getByRole("button", { name: "Accept connection" }).click();
  await waitForSuccessMessage(page, "Connection accepted.");

  await openPostedJobDetail(page, jobTitle);
  const providerApplicantCard = page
    .locator(".card")
    .filter({ hasText: providerUserId })
    .filter({ hasText: "applied" })
    .first();
  await expect(providerApplicantCard).toBeVisible();
  await providerApplicantCard.getByRole("button", { name: "Approve applicant" }).click();
  await waitForSuccessMessage(page, "Applicant approved. Booking lifecycle is now active.");

  await signOutIfVisible(page);
  await loginByUi(page, provider);

  await requestConsentAccessByUi(page, seekerUserId, requestPurpose);

  await signOutIfVisible(page);
  await loginByUi(page, seeker);
  await grantConsentByUi(page, providerUserId, grantPurpose);

  await signOutIfVisible(page);
  await loginByUi(page, provider);
  await assertConsentVisibility(page, seekerUserId, "allowed");

  await signOutIfVisible(page);
  await loginByUi(page, seeker);
  await revokeConsentByUi(page, providerUserId, "E2E revoke validation");

  await signOutIfVisible(page);
  await loginByUi(page, provider);
  await assertConsentVisibility(page, seekerUserId, "denied");

  const providerConnectionRow = await findConnectionRow(page, seekerUserId);
  await providerConnectionRow.getByRole("button", { name: /block person/i }).click();
  await waitForSuccessMessage(page, "Person blocked.");
  await expect(providerConnectionRow.getByText("blocked").first()).toBeVisible();
});

test("web E2E connection lifecycle: decline -> re-request -> accept -> block", async ({
  page
}) => {
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
  await firstPendingRow.getByRole("button", { name: "Decline request" }).click();
  await waitForSuccessMessage(page, "Connection request declined.");
  await expect(firstPendingRow.getByText("declined").first()).toBeVisible();

  await signOutIfVisible(page);
  await loginByUi(page, requester);
  await sendConnectionRequestByUi(page, ownerUserId);

  await signOutIfVisible(page);
  await loginByUi(page, owner);
  const secondPendingRow = await findConnectionRow(page, requesterUserId);
  await secondPendingRow.getByRole("button", { name: "Accept connection" }).click();
  await waitForSuccessMessage(page, "Connection accepted.");

  const acceptedRow = await findConnectionRow(page, requesterUserId);
  await expect(acceptedRow.getByText("accepted").first()).toBeVisible();
  await acceptedRow.getByRole("button", { name: /block person/i }).click();
  await waitForSuccessMessage(page, "Person blocked.");
  await expect(acceptedRow.getByText("blocked").first()).toBeVisible();
});

test("web E2E jobs visibility: connections_only blocks non-connections", async ({ page }) => {
  const seeker = makeUser("both");
  const provider = makeUser("both");
  const shortId = Date.now().toString(36).slice(-4);
  const title = `Connections only ${shortId}`;

  await registerByUi(page, seeker);
  const seekerUserId = await readCurrentUserId(page);

  await createJobByUi(page, {
    category: "plumber",
    locationText: "Kochi, Kakkanad",
    title,
    description: "Connections-only job posting for visibility access checks.",
    visibility: "connections_only"
  });
  await expect(page.getByText("Visibility: Connections only").first()).toBeVisible();

  await signOutIfVisible(page);
  await registerByUi(page, provider);
  const providerUserId = await readCurrentUserId(page);

  await clickMainNav(page, "Jobs");
  const connectedJobsCard = await cardByHeading(page, "Jobs from connected people");
  await expect(connectedJobsCard.getByText(title).first()).not.toBeVisible();

  await sendConnectionRequestByUi(page, seekerUserId);

  await signOutIfVisible(page);
  await loginByUi(page, seeker);
  const seekerConnectionRow = await findConnectionRow(page, providerUserId);
  await seekerConnectionRow.getByRole("button", { name: "Accept connection" }).click();
  await waitForSuccessMessage(page, "Connection accepted.");

  await signOutIfVisible(page);
  await loginByUi(page, provider);
  await clickMainNav(page, "Jobs");
  await page.getByRole("button", { name: "Refresh list" }).click();

  const connectedJobCard = await poll(async () => {
    const card = (await cardByHeading(page, "Jobs from connected people"))
      .locator(".card")
      .filter({ hasText: title })
      .first();
    return (await card.isVisible().catch(() => false)) ? card : undefined;
  }, 30_000);
  await expect(connectedJobCard).toBeVisible();
  await connectedJobCard.getByRole("button", { name: "Apply for job" }).click();
  await waitForSuccessMessage(page, "Application submitted.");
});

test("web E2E booking lifecycle: apply -> accept -> in_progress -> completed -> payment -> closed", async ({
  page
}) => {
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
  await clickMainNav(page, "Jobs");
  const publicJobsCard = await cardByHeading(page, "Public jobs");
  const publicJobCard = publicJobsCard.locator(".card").filter({ hasText: jobTitle }).first();
  await expect(publicJobCard).toBeVisible();
  await publicJobCard.getByRole("button", { name: "Apply for job" }).click();
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
  const member = makeUser("both");
  const adminUser = readAdminPortalUser();
  const shortId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const reviewNote = `Verification approved in E2E ${shortId}`;
  const submissionNote = `Verification submit note ${member.username}-${shortId}`;
  const documentMediaId = "11111111-1111-4111-8111-111111111111";

  const memberPage = await browser.newPage();
  const adminPage = await browser.newPage();

  try {
    await registerByUi(memberPage, member);

    await clickMainNav(memberPage, "Verify");
    await memberPage.getByLabel("Document media IDs").fill(documentMediaId);
    await memberPage
      .getByLabel("Notes (optional)")
      .fill(submissionNote);
    await memberPage.getByRole("button", { name: "Submit verification request" }).click();
    await waitForSuccessMessage(
      memberPage,
      "Verification request submitted! We'll review your documents shortly."
    );
    await expect(memberPage.getByText("Pending review").first()).toBeVisible();

    await loginToAdminPortalByUi(adminPage, adminUser);
    await clickAdminNav(adminPage, "Verifications");
    await expect(adminPage.getByText("Verification queue").first()).toBeVisible({
      timeout: 30_000
    });
    await adminPage.getByRole("button", { name: /^All$/i }).first().click();

    await reviewVerificationByUi(
      adminPage,
      submissionNote,
      reviewNote,
      "approved"
    );

    await signOutIfVisible(memberPage);
    await loginByUi(memberPage, member);

    await clickMainNav(memberPage, "Alerts");
    await expect(memberPage.getByText(/Verification approved/i).first()).toBeVisible({ timeout: 30_000 });

    await clickMainNav(memberPage, "Verify");
    await expect(memberPage.getByText("Approved").first()).toBeVisible();
    await expect(memberPage.getByText(reviewNote).first()).toBeVisible();
  } finally {
    await memberPage.close();
    await adminPage.close();
  }
});
