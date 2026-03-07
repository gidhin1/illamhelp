import { expect, Page, test } from "@playwright/test";

import {
  cardByHeading,
  E2eUser,
  makeUser,
  parseMemberId,
  readTextByTestId,
  waitForSuccessMessage
} from "../utils/flow-helpers";

let sharedUser: E2eUser | null = null;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    .locator("header nav")
    .getByRole("link", { name: new RegExp(`^${escapeRegex(label)}\\b`, "i") })
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
      { timeout: 15_000 }
    );
  } catch {
    return null;
  }
}

type AuthUiSession = {
  accessToken: string;
};

async function assertAuthResponse(
  responsePromise: Promise<import("@playwright/test").Response | null>,
  action: "register" | "login"
): Promise<AuthUiSession> {
  const response = await responsePromise;
  if (!response) {
    throw new Error(`Auth ${action} request was not fired from UI.`);
  }
  if (response.ok()) {
    return (await response.json()) as AuthUiSession;
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

async function openAuthEntry(page: Page, mode: "register" | "login"): Promise<void> {
  await gotoHome(page);
  if (mode === "register") {
    await page.getByRole("link", { name: /create account|register/i }).first().click();
    await expect(page.getByLabel("First name")).toBeVisible();
    return;
  }

  await page.getByRole("link", { name: /sign in/i }).first().click();
  await expect(page.getByLabel("Username or Email")).toBeVisible();
}

async function registerByUi(page: Page, user: E2eUser): Promise<AuthUiSession> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await resetBrowserSession(page);
    await openAuthEntry(page, "register");
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

async function loginByUi(page: Page, user: E2eUser): Promise<AuthUiSession> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await resetBrowserSession(page);
    await openAuthEntry(page, "login");
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

async function ensureSharedUser(page: Page): Promise<E2eUser> {
  if (sharedUser) {
    return sharedUser;
  }
  const user = makeUser("both");
  await registerByUi(page, user);
  await signOutIfVisible(page);
  sharedUser = user;
  return user;
}

async function loginAsShared(page: Page): Promise<E2eUser> {
  const user = await ensureSharedUser(page);
  await loginByUi(page, user);
  return user;
}

async function readCurrentUserId(page: Page): Promise<string> {
  await clickMainNav(page, "Profile");
  return parseMemberId(await readTextByTestId(page, "profile-user-id"), "current user id");
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

test.describe.configure({ mode: "serial" });

test("web guest home shows primary auth call-to-actions", async ({ page }) => {
  await resetBrowserSession(page);
  await gotoHome(page);

  await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" }).first()).not.toBeVisible();
});

test("web register and sign out works", async ({ page }) => {
  const user = makeUser("both");
  await registerByUi(page, user);
  sharedUser = user;

  await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeVisible();
  await signOutIfVisible(page);
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
});

test("web login shows error for wrong password", async ({ page }) => {
  const user = await ensureSharedUser(page);

  await resetBrowserSession(page);
  await openAuthEntry(page, "login");
  await page.getByLabel("Username or Email").fill(user.username);
  await page.getByLabel("Password").fill(`${user.password}x`);

  const responsePromise = waitForAuthResponse(page, "/auth/login", "POST");
  await page.locator("form button[type='submit']").first().click();

  const response = await responsePromise;
  expect(response).not.toBeNull();
  expect(response?.ok()).toBeFalsy();
  await expect(page.locator(".banner.error").first()).toBeVisible();
});

test("web authenticated home hides guest auth call-to-actions", async ({ page }) => {
  await loginAsShared(page);
  await gotoHome(page);

  await expect(page.getByRole("link", { name: "Browse jobs" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" }).first()).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).not.toBeVisible();
});

test("web protected pages show sign-in card when signed out", async ({ page }) => {
  await resetBrowserSession(page);
  await clickMainNav(page, "Jobs");

  await expect(page.getByText("Please sign in").first()).toBeVisible();
  await expect(page.getByText("Sign in or create an account to continue.").first()).toBeVisible();
});

test("web jobs page shows validation feedback for short payload", async ({ page }) => {
  await loginAsShared(page);
  await clickMainNav(page, "Jobs");

  await page.getByLabel("Category").fill("p");
  await page.getByLabel("Location text").fill("k");
  await page.getByLabel("Title").fill("abc");
  await page.getByLabel("Description").fill("Description is long enough for browser validation.");
  await page.getByRole("button", { name: "Post job" }).click();

  const errorBanner = page.locator(".banner.error").first();
  await expect(errorBanner).toBeVisible();
  await expect(errorBanner).toContainText(/must|longer|at least/i);
});

test("web jobs create form defaults visibility to public", async ({ page }) => {
  await loginAsShared(page);
  await clickMainNav(page, "Jobs");
  await expect(page.getByRole("combobox", { name: "Visibility" }).first()).toHaveValue("public");
});

test("web jobs page posts a valid job", async ({ page }) => {
  const shortId = Date.now().toString(36).slice(-4);
  const jobTitle = `E2E job ${shortId}`;

  await loginAsShared(page);
  await clickMainNav(page, "Jobs");

  await page.getByLabel("Category").fill("plumber");
  await page.getByLabel("Location text").fill("Kakkanad, Kochi");
  await page.getByLabel("Title").fill(jobTitle);
  await page.getByLabel("Description").fill("Need urgent kitchen sink leak repair service.");
  await page.getByRole("button", { name: "Post job" }).click();

  await waitForSuccessMessage(page, "Job posted successfully.");
  await expect(page.getByText(jobTitle).first()).toBeVisible();
});

test("web jobs page posts connections-only job and shows visibility in posted section", async ({
  page
}) => {
  const shortId = Date.now().toString(36).slice(-5);
  const jobTitle = `Connections-only ${shortId}`;
  await loginAsShared(page);
  await clickMainNav(page, "Jobs");

  await page.getByLabel("Category").fill("electrician");
  await page.getByLabel("Location text").fill("Aluva, Kochi");
  await page.getByLabel("Title").fill(jobTitle);
  await page
    .getByLabel("Description")
    .fill("Connections-only posting for trusted-network visibility checks.");
  await page.getByRole("combobox").first().selectOption("connections_only");
  await page.getByRole("button", { name: "Post job" }).click();
  await waitForSuccessMessage(page, "Job posted successfully.");

  const postedByMeCard = await cardByHeading(page, "Jobs posted by me");
  const targetJobCard = postedByMeCard
    .locator(".card")
    .filter({ hasText: jobTitle })
    .first();
  await expect(targetJobCard).toBeVisible();
  await expect(targetJobCard.getByText("Visibility: Connections only")).toBeVisible();
});

test("web jobs page shows posted job under 'Jobs posted by me' with applicant-management action", async ({
  page
}) => {
  const shortId = Date.now().toString(36).slice(-5);
  const jobTitle = `Posted by me ${shortId}`;
  await loginAsShared(page);
  await clickMainNav(page, "Jobs");

  await page.getByLabel("Category").fill("plumber");
  await page.getByLabel("Location text").fill("Kakkanad, Kochi");
  await page.getByLabel("Title").fill(jobTitle);
  await page
    .getByLabel("Description")
    .fill("Need support for leaking sink valve replacement in kitchen.");
  await page.getByRole("button", { name: "Post job" }).click();
  await waitForSuccessMessage(page, "Job posted successfully.");

  const postedByMeCard = await cardByHeading(page, "Jobs posted by me");
  const targetJobCard = postedByMeCard
    .locator(".card")
    .filter({ hasText: jobTitle })
    .first();
  await expect(targetJobCard).toBeVisible();
  await expect(targetJobCard.getByRole("button", { name: "Manage applicants" })).toBeVisible();
});

test("web jobs posted by me opens applicant manager with empty applicants state", async ({ page }) => {
  const shortId = Date.now().toString(36).slice(-5);
  const jobTitle = `Applicants empty ${shortId}`;
  await loginAsShared(page);
  await clickMainNav(page, "Jobs");

  await page.getByLabel("Category").fill("plumber");
  await page.getByLabel("Location text").fill("Kakkanad, Kochi");
  await page.getByLabel("Title").fill(jobTitle);
  await page
    .getByLabel("Description")
    .fill("New posting to validate applicant manager empty state rendering.");
  await page.getByRole("button", { name: "Post job" }).click();
  await waitForSuccessMessage(page, "Job posted successfully.");

  const postedByMeCard = await cardByHeading(page, "Jobs posted by me");
  const targetJobCard = postedByMeCard
    .locator(".card")
    .filter({ hasText: jobTitle })
    .first();
  await expect(targetJobCard).toBeVisible();
  await targetJobCard.getByRole("button", { name: "Manage applicants" }).click();

  await expect(page).toHaveURL(/\/jobs\/.+$/);
  await expect(page.getByRole("heading", { name: "Applicants", exact: true })).toBeVisible();
  await expect(page.getByText("No applications yet").first()).toBeVisible();
  await expect(page.getByText("Once people apply, you can approve or reject them here.").first()).toBeVisible();
  await page.getByRole("button", { name: "Back to jobs" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByRole("heading", { name: "Find work and manage your postings" })).toBeVisible();
});

test("web connections page validates empty query", async ({ page }) => {
  await loginAsShared(page);
  await clickMainNav(page, "People");

  await page.getByLabel("Find a person").fill("   ");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Enter a name, member ID, service, or location.").first()).toBeVisible();
});

test("web notifications page lists unread connection alert and allows mark-read", async ({
  page
}) => {
  await loginAsShared(page);
  const ownerUserId = await readCurrentUserId(page);

  const requester = makeUser("both");
  await signOutIfVisible(page);
  await registerByUi(page, requester);
  await sendConnectionRequestByUi(page, ownerUserId);

  await signOutIfVisible(page);
  await loginAsShared(page);
  await clickMainNav(page, "Alerts");

  await page.getByRole("button", { name: "Show unread only" }).click();
  const markReadButtons = page.getByRole("button", { name: "Mark read" });
  await expect
    .poll(async () => markReadButtons.count(), { timeout: 20_000 })
    .toBeGreaterThan(0);

  const countBeforeClick = await markReadButtons.count();
  await markReadButtons.first().click();
  await expect.poll(async () => markReadButtons.count()).toBeLessThan(countBeforeClick);
});

test("web notifications page toggles unread filter labels", async ({ page }) => {
  await loginAsShared(page);
  await clickMainNav(page, "Alerts");

  const unreadToggle = page.getByRole("button", { name: "Show unread only" }).first();
  await expect(unreadToggle).toBeVisible();
  await unreadToggle.click();
  await expect(page.getByRole("button", { name: "Show all" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Show all" }).first().click();
  await expect(page.getByRole("button", { name: "Show unread only" }).first()).toBeVisible();
});

test("web notifications mark-all-read clears unread state when present", async ({ page }) => {
  await loginAsShared(page);
  await clickMainNav(page, "Alerts");

  const markAllButton = page.getByRole("button", { name: "Mark all read" }).first();
  if (await markAllButton.isVisible().catch(() => false)) {
    await markAllButton.click();
    await expect(markAllButton).not.toBeVisible();
  } else {
    await expect(markAllButton).not.toBeVisible();
  }
});

test("web connections search finds a member by service/location query", async ({ page }) => {
  await loginAsShared(page);
  await clickMainNav(page, "People");
  await page.getByLabel("Find a person").fill("plumber kakkanad");
  await page.getByRole("button", { name: "Search" }).click();
  const anyMatch = page.locator(".card").filter({ hasText: /Member ID:/i }).first();
  await expect(anyMatch).toBeVisible();
});

test("web consent page shows empty state when no consent activity exists", async ({ page }) => {
  await loginAsShared(page);
  await clickMainNav(page, "Privacy");

  await expect(page.getByText("No access requests").first()).toBeVisible();
  await expect(page.getByText("No consent grants").first()).toBeVisible();
});

test("web profile page updates details", async ({ page }) => {
  await loginAsShared(page);
  await clickMainNav(page, "Profile");

  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("Area").fill("Kakkanad");
  await page.getByLabel("Services offered").fill("plumber, electrician");
  await page.getByTestId("profile-phone-input").fill("+919812345678");
  await page.getByRole("button", { name: "Save profile" }).click();

  await waitForSuccessMessage(page, "Profile updated.");
});
