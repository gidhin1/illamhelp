import { expect, Locator, Page, test } from "@playwright/test";
import path from "node:path";

import { openSignedOutMemberHome, E2eUser, makeUser, parseMemberId } from "../utils/flow-helpers";

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
  await openSignedOutMemberHome(page, webBaseUrl);
}
async function openWebAuthEntry(page: Page, mode: "register" | "login"): Promise<void> {
  await gotoWebHome(page);
  const analyticsChoice = page.getByRole("complementary", { name: "Analytics privacy choice" });
  if (await analyticsChoice.isVisible()) {
    await analyticsChoice.getByRole("button", { name: "Decline analytics" }).click();
  }
  if (mode === "register") {
    await page.getByRole("link", { name: /join now|sign up|create account|register/i }).first().click();
    await expect(page.getByLabel("First name")).toBeVisible();
    return;
  }

  await page.getByRole("link", { name: /sign in/i }).first().click();
  await expect(page.getByLabel("Username or email")).toBeVisible();
}

async function registerWebUser(page: Page, user: E2eUser): Promise<AuthSession> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await resetWebBrowserSession(page);
    await openWebAuthEntry(page, "register");

    await page.getByLabel("First name").fill(user.firstName);
    await page.getByLabel("Last name").fill(user.lastName);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Member ID").fill(user.username);
    await page.getByLabel("Phone (optional)").fill("+919876543210");
    await page.getByLabel("Password").fill(user.password);
    await page.getByLabel(/I agree to the current Terms and Conditions and Privacy Policy/i).check();

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

    await page.getByLabel("Username or email").fill(user.username);
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
      page.getByRole("heading", { name: /Review work/i }).first(),
      page.getByRole("heading", { name: /Review photos and videos/i }).first(),
      page.getByRole("heading", { name: /Review verification requests/i }).first(),
      page.getByRole("button", { name: /Run automated checks/i }).first(),
      page.getByRole("button", { name: /sign out/i }).first()
    ],
    10_000
  );
}

async function waitForAnyVisible(locators: Locator[], timeoutMs = 10_000): Promise<Locator> {
  try {
    return await Promise.any(
      locators.map(async (locator) => {
        await locator.waitFor({ state: "visible", timeout: timeoutMs });
        return locator;
      })
    );
  } catch {
    throw new Error("None of the expected UI states became visible.");
  }
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

  const errorBanner = page.getByRole("main").getByRole("alert").filter({
    hasText: /check your username or email and password/i
  });
  await expect(errorBanner).toBeVisible({ timeout: 10_000 });
  await expect(errorBanner).toContainText(
    /check your username or email and password/i
  );
});

test("admin portal login, navigation, and sign out flow works", async ({ page }) => {
  const adminUser = readAdminPortalUser();
  await loginAdminPortalByUi(page, adminUser);

  await expect(page.getByRole("heading", { name: /Review work/i })).toBeVisible();
  await clickAdminNav(page, "Moderation");
  await expect(page.getByRole("heading", { name: /Review photos and videos/i })).toBeVisible();

  await clickAdminNav(page, "Verifications");
  await expect(page.getByRole("heading", { name: /Review verification requests/i })).toBeVisible();

  await clickAdminNav(page, "Audit contact sharing");
  await expect(page.getByRole("heading", { name: /Contact sharing and account activity/i })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();

  await page.goto(`${adminBaseUrl}/moderation`);
  await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible();
});

test("admin moderation page renders queue controls and stable states", async ({ page }) => {
  const adminUser = readAdminPortalUser();
  await page.setViewportSize({ width: 820, height: 900 });
  await loginAdminPortalByUi(page, adminUser);
  await clickAdminNav(page, "Moderation");

  await expect(page.getByRole("heading", { name: /Review photos and videos/i })).toBeVisible();
  await expect(page.getByTestId("moderation-status-filter")).toBeVisible();
  const processPendingButton = page.getByRole("button", { name: "Run automated checks" });
  await expect(processPendingButton).toBeVisible();
  await expect(processPendingButton).toBeEnabled();
  await expect(page.getByTestId("moderation-details-panel")).toBeHidden();

  await page.getByTestId("moderation-status-filter").selectOption("pending");
  await waitForAnyVisible(
    [
      page.getByRole("region", { name: /Moderation queue/i }).first(),
      page.getByText("No items found").first(),
      page.getByText("Loading queue...").first()
    ],
    10_000
  );
});

test("admin moderation status filter cycles through queue states safely", async ({ page }) => {
  const adminUser = readAdminPortalUser();
  await loginAdminPortalByUi(page, adminUser);
  await clickAdminNav(page, "Moderation");

  await expect(page.getByRole("heading", { name: /Review photos and videos/i })).toBeVisible();
  const statusFilter = page.getByTestId("moderation-status-filter");
  await expect(statusFilter).toBeVisible();

  for (const state of ["pending", "running", "approved", "rejected", "error"] as const) {
    await statusFilter.selectOption(state);
    await waitForAnyVisible(
      [
        page.getByRole("region", { name: /Moderation queue/i }).first(),
        page.getByText("No items found").first(),
        page.getByText("Loading queue...").first()
      ],
      10_000
    );
  }
});

test("admin verifications page supports filter and refresh interactions", async ({ page }) => {
  const adminUser = readAdminPortalUser();
  await loginAdminPortalByUi(page, adminUser);
  await clickAdminNav(page, "Verifications");

  await expect(page.getByRole("heading", { name: /Review verification requests/i })).toBeVisible();

  const filters = ["Pending", "Under review", "Approved", "Rejected", "All statuses"];
  for (const filter of filters) {
    await page.getByRole("button", { name: new RegExp(filter, "i") }).first().click();
  }

  await waitForAnyVisible(
    [
      page.getByRole("heading", { name: "Verification queue" }),
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
  await clickAdminNav(page, "Audit contact sharing");

  await expect(page.getByRole("heading", { name: /Contact sharing and account activity/i })).toBeVisible();
  await expect(page.getByText("Search member activity").first()).toBeVisible();

  await page.getByTestId("timeline-member-id").fill(`missing_member_${Date.now().toString(36)}`);
  await page.getByTestId("timeline-search").click();

  await waitForAnyVisible(
    [
      page.getByTestId("timeline-member-summary"),
      page.getByRole("main").getByRole("alert").first(),
      page.getByText("Search member activity").first()
    ],
    10_000
  );
});

test("signed-in member cannot access operations pages", async ({ browser }) => {
  const member = makeUser("seeker");
  const memberPage = await browser.newPage();
  const adminPage = await browser.newPage();

  try {
    await registerWebUser(memberPage, member);
    await adminPage.goto(`${adminBaseUrl}/auth/login`);
    await adminPage.getByLabel("Username or email").fill(member.username);
    await adminPage.getByLabel("Password").fill(member.password);
    await adminPage.getByRole("main").getByRole("button", { name: "Sign in" }).click();
    await expect(adminPage.getByRole("heading", { name: "Admin access required" })).toBeVisible();

    for (const route of ["/moderation", "/verifications", "/audit"]) {
      await adminPage.goto(`${adminBaseUrl}${route}`);
      await expect(adminPage.getByRole("heading", { name: "Admin access required" })).toBeVisible();
    }
  } finally {
    await memberPage.close();
    await adminPage.close();
  }
});

const verificationOutcomes = [
  {
    decision: "approved",
    action: "Approve verification",
    notification: "Your profile is verified",
    memberStatus: "Approved"
  },
  {
    decision: "rejected",
    action: "Reject verification",
    notification: "Verification not approved",
    memberStatus: "Needs changes"
  }
] as const;

for (const outcome of verificationOutcomes) {
  test(`admin portal E2E verification lifecycle: ${outcome.decision} decision reaches the member`, async ({ browser }, testInfo) => {
    test.setTimeout(30_000);
    const member = makeUser("both");
    const adminUser = readAdminPortalUser();
    const shortId = Date.now().toString(36).slice(-4);
    const submissionNote = `Government ID submitted for admin portal E2E verification ${shortId}.`;
    const reviewNote = `Decision ${outcome.decision} by admin portal E2E ${shortId}`;

    const memberPage = await browser.newPage();
    const narrow = outcome.decision === "rejected";
    const adminPage = await browser.newPage(narrow ? { viewport: { width: 390, height: 844 } } : {});

    try {
      const memberSession = await registerWebUser(memberPage, member);
      const memberUserId = memberSession.userId;

      await clickWebNav(memberPage, "Verify");
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
      await expect(memberPage.getByText("1 private document ready to submit.")).toBeVisible();
      await memberPage.getByLabel("Notes for the reviewer (optional)").fill(submissionNote);
      await memberPage.getByRole("button", { name: "Submit verification request" }).click();
      await expect(
        memberPage.getByRole("status").filter({ hasText: "Request sent. Check this page for the review result." })
      ).toBeVisible();
      await expect(memberPage.getByText("Pending review").first()).toBeVisible();
      await memberPage.screenshot({ path: testInfo.outputPath("verification-submitted.png") });

      await loginAdminPortalByUi(adminPage, adminUser);
      await clickAdminNav(adminPage, "Verifications");
      await adminPage.getByRole("button", { name: /^All statuses$/i }).first().click();

      const verificationRequest = await test.step("wait for verification request", async () =>
        poll(async () => {
          const request = adminPage
            .getByRole("region", { name: "Verification requests" })
            .getByRole("button")
            .filter({ hasText: memberUserId })
            .first();
          if (await request.isVisible().catch(() => false)) {
            return request;
          }
          await adminPage.getByRole("button", { name: /^Pending$/i }).first().click().catch(() => undefined);
          await adminPage.getByRole("button", { name: /^All statuses$/i }).first().click().catch(() => undefined);
          return undefined;
        }, 10_000)
      );

      await adminPage.getByTestId("verification-queue-search").fill(memberUserId);
      await adminPage.getByTestId("verification-sort-order").selectOption("newest");
      await verificationRequest.click();
      if (narrow) {
        const back = adminPage.getByRole("button", { name: "Back to queue", exact: true });
        await expect(verificationRequest).toBeHidden();
        await back.click();
        await expect(verificationRequest).toBeFocused();
        await verificationRequest.click();
      }
      const reviewPanel = adminPage.getByTestId("verification-review-panel");
      await expect(reviewPanel.getByText(memberUserId).first()).toBeVisible();
      await reviewPanel.getByRole("button", { name: "Preview document", exact: true }).click();
      await expect(reviewPanel.getByRole("img", { name: "Private verification document preview" }))
        .toHaveJSProperty("naturalWidth", 1);
      const refreshedPreview = adminPage.waitForResponse(response =>
        response.url().endsWith("/GetModerationDetails") && response.ok()
      );
      await reviewPanel.getByRole("button", { name: "Refresh preview", exact: true }).click();
      await refreshedPreview;
      await expect(reviewPanel.getByRole("img", { name: "Private verification document preview" }))
        .toHaveJSProperty("naturalWidth", 1);
      const decision = reviewPanel.getByRole("button", { name: outcome.action, exact: true });
      if (outcome.decision === "rejected") {
        await expect(decision).toBeDisabled();
      }
      await reviewPanel.getByLabel("Decision notes").fill(reviewNote);
      await decision.click();
      const dialog = adminPage.getByRole("dialog");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(reviewPanel.getByLabel("Decision notes")).toHaveValue(reviewNote);
      await decision.click();
      await dialog.getByRole("button", { name: outcome.decision === "approved" ? "Confirm approval" : "Confirm rejection" }).click();
      await expect(adminPage.getByText(`Verification ${outcome.decision} successfully.`)).toBeVisible();
      await expect(reviewPanel.getByRole("heading", { name: "Recorded decision" })).toBeVisible();
      await adminPage.getByRole("button", { name: "Return to queue", exact: true }).click();
      await expect(adminPage.getByTestId("verification-queue-search")).toHaveValue(memberUserId);
      await expect(adminPage.getByTestId("verification-sort-order")).toHaveValue("newest");

      await signOutIfVisible(memberPage);
      await loginWebUser(memberPage, member);

      await clickWebNav(memberPage, "Alerts");
      await expect(memberPage.getByText(outcome.notification, { exact: true })).toBeVisible({ timeout: 10_000 });

      await clickWebNav(memberPage, "Verify");
      await expect(memberPage.getByRole("heading", { name: `Current status ${outcome.memberStatus}` })).toBeVisible();
      await expect(memberPage.getByText(reviewNote).first()).toBeVisible();
    } finally {
      await memberPage.close();
      await adminPage.close();
    }
  });
}

for (const [media, decision] of [["profile", "approved"], ["job", "approved"], ["profile", "rejected"]] as const) {
  const approved = decision === "approved";
  const scenario = approved ? `admin approves a ${media} video and a member can play it` : "admin rejects a profile video and keeps it out of the approved gallery";
  test(scenario, async ({ browser }) => {
    test.setTimeout(30_000);
    const member = makeUser(media === "profile" ? "provider" : "both");
    const adminUser = readAdminPortalUser();
    const memberPage = await browser.newPage();
    const adminPage = await browser.newPage();

    try {
      await registerWebUser(memberPage, member);
      await clickWebNav(memberPage, "Profile");
      const memberIdText = await memberPage.getByTestId("profile-user-id").innerText();
      const memberId = parseMemberId(memberIdText, `${media} video owner`);

      if (media === "job") {
        const jobTitle = `Video review for ${member.firstName} ${member.lastName}`;
        await clickWebNav(memberPage, "Discover");
        await memberPage.getByRole("link", { name: "Posted by me", exact: true }).click();
        await memberPage.getByLabel("Category").fill("plumber");
        await memberPage.getByLabel("Location").fill("Kakkanad, Kochi");
        await memberPage.getByLabel("Title").fill(jobTitle);
        await memberPage.getByLabel("Description").fill("Replace the kitchen sink tap.");
        await memberPage.getByRole("button", { name: "Post job", exact: true }).click();
        const job = memberPage.locator("article").filter({ hasText: jobTitle });
        await job.getByRole("button", { name: "Manage job" }).click();
      }

      await memberPage.getByLabel(media === "job" ? "Choose job photos or videos" : "Choose photos or videos").setInputFiles(
        path.resolve("tests/playwright/fixtures", media === "profile" ? "service-proof-video.mp4" : "sample-video-640x360.mp4")
      );
      await memberPage.getByRole("button", { name: "Upload for review", exact: true }).click();
      if (media === "profile") {
        await expect(memberPage.getByTestId("profile-media-upload-pending")).toContainText("Video");
      } else {
        await expect(memberPage.getByRole("status")).toContainText("1 job file uploaded for review.");
        const pending = memberPage.getByTestId("job-media-upload-pending");
        await expect(pending).toContainText("Video");
        await memberPage.reload();
        await expect(pending).toContainText("Video");
      }

      await loginAdminPortalByUi(adminPage, adminUser);
      await clickAdminNav(adminPage, "Moderation");
      await adminPage.getByRole("button", { name: "Run automated checks" }).click();

      await adminPage.getByTestId("moderation-queue-search").fill(member.username);
      const queue = adminPage.getByRole("region", { name: "Moderation queue" });
      const reviewItem = queue.getByRole("button").filter({
        hasText: new RegExp(`${member.firstName} ${member.lastName}.*human review pending`, "i")
      });
      await reviewItem.click();
      const preview = adminPage.getByTestId("moderation-preview-video");
      await expect(preview).toHaveCount(0);
      await adminPage.getByRole("button", { name: "Preview upload", exact: true }).click();
      await expect(preview).toBeVisible();
      await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
      const reject = adminPage.getByRole("button", { name: "Reject upload", exact: true });
      await expect(reject).toBeDisabled();
      if (!approved) {
        await adminPage.getByLabel("Rejection reason").selectOption("policy_unrelated_media");
        await adminPage.getByLabel("Moderator notes").fill("The video does not show the service.");
        await reject.click();
        await adminPage.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(adminPage.getByLabel("Moderator notes")).toHaveValue("The video does not show the service.");
      }
      await adminPage.getByRole("button", { name: approved ? "Approve upload" : "Reject upload", exact: true }).click();
      await adminPage.getByRole("dialog").getByRole("button", { name: approved ? "Confirm approval" : "Confirm rejection", exact: true }).click();
      await expect(adminPage.getByText(`Media ${decision}.`, { exact: true })).toBeVisible();
      await adminPage.getByRole("button", { name: "Return to queue", exact: true }).click();
      await expect(adminPage.getByTestId("moderation-queue-search")).toHaveValue(member.username);
      await expect(adminPage.getByTestId("moderation-status-filter")).toHaveValue("pending");
      await expect(reviewItem).toHaveCount(0);

      await clickAdminNav(adminPage, "Audit");
      await adminPage.getByLabel("Member ID").fill(memberId);
      await adminPage.getByRole("button", { name: "Search", exact: true }).click();
      await expect(adminPage.getByRole("table", { name: "Recorded account actions" })
        .getByRole("cell", { name: "media_human_review_decided" })).toBeVisible();

      if (media === "profile") {
        await memberPage.getByText("Preview a member’s approved media", { exact: true }).click();
        await memberPage.getByTestId("profile-public-owner-input").fill(memberId);
        const galleryLoaded = memberPage.waitForResponse(response =>
          response.url().endsWith("/ListProfileMedia") && response.ok()
        );
        const viewApproved = memberPage.getByRole("button", { name: "View approved media", exact: true });
        await viewApproved.click();
        await galleryLoaded;
        await expect(viewApproved).toBeEnabled();
      } else {
        await memberPage.getByRole("button", { name: "Refresh job media" }).click();
        await expect(memberPage.getByTestId("job-media-upload-pending")).toHaveCount(0);
      }
      if (!approved) {
        await expect(memberPage.getByTestId("profile-public-media-grid-empty")).toBeVisible();
        await clickWebNav(memberPage, "Alerts");
        await expect(memberPage.getByRole("heading", { name: "Media rejected", exact: true })).toBeVisible();
        return;
      }
      const gallery = memberPage.getByTestId(media === "profile" ? "profile-public-media-grid" : "job-detail-media-grid");
      await gallery.getByRole("button", { name: `Open full size: ${media} video` }).click();
      const video = memberPage.getByRole("dialog", { name: "Video viewer" }).getByLabel(`Approved ${media} video`);
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
    } finally {
      await memberPage.close();
      await adminPage.close();
    }
  });
}
