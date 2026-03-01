import { expect, Page, test } from "@playwright/test";

import { E2eUser, makeUser, waitForSuccessMessage } from "../utils/flow-helpers";

interface AuthUiSession {
  accessToken: string;
}

let sharedUser: E2eUser | null = null;
let sharedSession: AuthUiSession | null = null;

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
  await page.goto("/");
  await signOutIfVisible(page);

  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = "illamhelp_access_token=; Path=/; Max-Age=0; SameSite=Lax";
  });

  await page.context().clearCookies();
}

async function registerByUi(page: Page, user: E2eUser): Promise<AuthUiSession> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await resetBrowserSession(page);
    await page.goto("/auth/register");
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
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < 5 && message.includes("HTTP 429")) {
        await page.waitForTimeout(2500 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Register flow did not complete.");
}

async function loginByUi(page: Page, user: E2eUser): Promise<AuthUiSession> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await resetBrowserSession(page);
    await page.goto("/auth/login");
    await page.getByLabel("Username or Email").fill(user.username);
    await page.getByLabel("Password").fill(user.password);

    const responsePromise = waitForAuthResponse(page, "/auth/login", "POST");
    await page.locator("form button[type='submit']").first().click();
    try {
      const session = await assertAuthResponse(responsePromise, "login");
      await expect(page).toHaveURL(/\/jobs$/);
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < 5 && message.includes("HTTP 429")) {
        await page.waitForTimeout(2500 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Login flow did not complete.");
}

async function applySessionCookie(page: Page, accessToken: string): Promise<void> {
  await resetBrowserSession(page);
  await page.goto("/");
  await page.evaluate((token) => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `illamhelp_access_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}`;
  }, accessToken);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeVisible({
    timeout: 20_000
  });
}

async function ensureSharedSession(page: Page): Promise<{ user: E2eUser; session: AuthUiSession }> {
  if (sharedUser && sharedSession) {
    return { user: sharedUser, session: sharedSession };
  }

  sharedUser = makeUser("both");
  sharedSession = await registerByUi(page, sharedUser);
  return { user: sharedUser, session: sharedSession };
}

test.describe.configure({ mode: "serial" });

test("web guest home shows primary auth call-to-actions", async ({ page }) => {
  await resetBrowserSession(page);
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" }).first()).not.toBeVisible();
});

test("web register and sign out works", async ({ page }) => {
  const user = makeUser("both");

  const session = await registerByUi(page, user);
  sharedUser = user;
  sharedSession = session;
  await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeVisible();

  await signOutIfVisible(page);
  await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeVisible();
});

test("web login shows error for wrong password", async ({ page }) => {
  const { user } = await ensureSharedSession(page);
  await signOutIfVisible(page);

  await page.goto("/auth/login");
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
  const { session } = await ensureSharedSession(page);
  await applySessionCookie(page, session.accessToken);
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Browse jobs" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" }).first()).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).not.toBeVisible();
});

test("web protected pages show sign-in card when signed out", async ({ page }) => {
  await resetBrowserSession(page);
  await page.goto("/jobs");

  await expect(page.getByText("Please sign in").first()).toBeVisible();
  await expect(page.getByText("Sign in or create an account to continue.").first()).toBeVisible();
});

test("web jobs page shows validation feedback for short payload", async ({ page }) => {
  const { session } = await ensureSharedSession(page);
  await applySessionCookie(page, session.accessToken);
  await page.goto("/jobs");

  await page.getByLabel("Category").fill("p");
  await page.getByLabel("Location text").fill("k");
  await page.getByLabel("Title").fill("abc");
  await page.getByLabel("Description").fill("Description is long enough for browser validation.");
  await page.getByRole("button", { name: "Post job" }).click();

  const errorBanner = page.locator(".banner.error").first();
  await expect(errorBanner).toBeVisible();
  await expect(errorBanner).toContainText(/must|longer|at least/i);
});

test("web jobs page posts a valid job", async ({ page }) => {
  const { session } = await ensureSharedSession(page);
  const shortId = Date.now().toString(36).slice(-4);
  const jobTitle = `E2E job ${shortId}`;

  await applySessionCookie(page, session.accessToken);
  await page.goto("/jobs");

  await page.getByLabel("Category").fill("plumber");
  await page.getByLabel("Location text").fill("Kakkanad, Kochi");
  await page.getByLabel("Title").fill(jobTitle);
  await page.getByLabel("Description").fill("Need urgent kitchen sink leak repair service.");
  await page.getByRole("button", { name: "Post job" }).click();

  await waitForSuccessMessage(page, "Job posted successfully.");
  await expect(page.getByText(jobTitle).first()).toBeVisible();
});

test("web connections page validates empty query", async ({ page }) => {
  const { session } = await ensureSharedSession(page);
  await applySessionCookie(page, session.accessToken);
  await page.goto("/connections");

  await page.getByLabel("Find a person").fill("   ");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Enter a name, member ID, service, or location.").first()).toBeVisible();
});

test("web connections search finds a member by service/location query", async ({ page }) => {
  const { session } = await ensureSharedSession(page);
  await applySessionCookie(page, session.accessToken);
  await page.goto("/connections");
  await page.getByLabel("Find a person").fill("plumber kakkanad");
  await page.getByRole("button", { name: "Search" }).click();
  const anyMatch = page.locator(".card").filter({ hasText: /Member ID:/i }).first();
  await expect(anyMatch).toBeVisible();
});

test("web consent page shows empty state when no consent activity exists", async ({ page }) => {
  const { session } = await ensureSharedSession(page);
  await applySessionCookie(page, session.accessToken);
  await page.goto("/consent");

  await expect(page.getByText("No access requests").first()).toBeVisible();
  await expect(page.getByText("No consent grants").first()).toBeVisible();
});

test("web profile page updates details", async ({ page }) => {
  const { session } = await ensureSharedSession(page);
  await applySessionCookie(page, session.accessToken);
  await page.goto("/profile");

  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("Area").fill("Kakkanad");
  await page.getByLabel("Services offered").fill("plumber, electrician");
  await page.getByTestId("profile-phone-input").fill("+919812345678");
  await page.getByRole("button", { name: "Save profile" }).click();

  await waitForSuccessMessage(page, "Profile updated.");
});
