import path from "node:path";

import { expect, Page, test } from "@playwright/test";

import {
  declineMemberAnalytics,
  openSignedOutMemberHome,
  cardByHeading,
  E2eUser,
  makeUser,
  waitForSuccessMessage
} from "../utils/flow-helpers";

const commonsValveImage = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "commons-plumbing-valve.jpg"
);
const sampleVideo = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "sample-video-640x360.mp4"
);

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

  const targetLink = page
    .getByRole("link", { name: new RegExp(`^${escapeRegex(labels[section])}$`, "i") })
    .first();
  await expect(targetLink).toBeVisible();

  if ((await targetLink.getAttribute("aria-current")) !== "page") {
    await targetLink.click();
  }

  await expect(page.getByRole("heading", { name: expectedHeadings[section] }).first()).toBeVisible();
}

function jobCard(page: Page, title: string) {
  return page.locator("article").filter({ hasText: title }).first();
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
  await openSignedOutMemberHome(page, "/");
}
async function openAuthEntry(page: Page, mode: "register" | "login"): Promise<void> {
  await gotoHome(page);
  if (mode === "register") {
    await page.getByRole("link", { name: /join now|sign up|create account|register/i }).first().click();
    await expect(page.getByLabel("First name")).toBeVisible();
    return;
  }

  await page.getByRole("link", { name: /sign in/i }).first().click();
  await expect(page.getByLabel("Username or email")).toBeVisible();
}

async function registerByUi(page: Page, user: E2eUser): Promise<AuthUiSession> {
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

async function registerNewMember(page: Page): Promise<E2eUser> {
  const user = makeUser("both");
  await registerByUi(page, user);
  return user;
}

async function createConnectionAlert(page: Page): Promise<void> {
  const owner = await registerNewMember(page);
  const requesterPage = await page.context().browser()!.newPage();
  try {
    await registerNewMember(requesterPage);
    await sendConnectionRequestByUi(requesterPage, owner.username);
  } finally {
    await requesterPage.close();
  }
}

async function sendConnectionRequestByUi(page: Page, targetUserId: string): Promise<void> {
  await clickMainNav(page, "People");
  await page.getByLabel("Find a person").fill(targetUserId);
  await page.getByRole("button", { name: /Search people|Search/i }).click();

  const matchCard = page.getByRole("article").filter({ hasText: `Member ID: ${targetUserId}` }).first();

  await expect(matchCard).toBeVisible();
  await matchCard.getByRole("button", { name: "Send request", exact: true }).click();
  await waitForSuccessMessage(page, "Connection request sent.");
}

test("web registration keeps the draft and consent unchecked while reading policies", async ({ page, context }) => {
  await page.goto("/auth/register");
  const firstName = page.getByLabel("First name");
  await firstName.fill("Registration draft");
  const agreement = page.getByRole("checkbox", { name: /I agree to the current Terms and Conditions and Privacy Policy/i });

  for (const [link, heading] of [["Terms and Conditions", "Terms and Conditions"], ["Privacy Policy", "Privacy Policy"]] as const) {
    const documentOpened = context.waitForEvent("page");
    await page.getByRole("link", { name: link, exact: true }).first().click();
    const document = await documentOpened;
    await expect(document.getByRole("heading", { name: heading, exact: true, level: 1 })).toBeVisible();
    await document.close();
    await expect(firstName).toHaveValue("Registration draft");
    await expect(agreement).not.toBeChecked();
  }
});

test("web guest home shows primary auth call-to-actions", async ({ page }) => {
  await resetBrowserSession(page);
  await gotoHome(page);

  await expect(page.getByRole("link", { name: /create account|join now|sign up/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" }).first()).not.toBeVisible();
  await expect(page.locator("main#main-content")).toHaveCount(1);
});

test("web mobile navigation is labeled and dismissible as a dialog", async ({ page }) => {
  await resetBrowserSession(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("heading", { level: 1 }).first()).toBeVisible();

  await expect(page.getByTestId("tab-home").getByText("Home")).toBeVisible();
  await page.getByTestId("mobile-drawer-toggle").click();
  const drawer = page.getByRole("dialog", { name: "Navigation menu" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveClass(/motion-drawer/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Navigation menu" })).not.toBeVisible();
});

test("web register and sign out works", async ({ page }) => {
  const user = makeUser("both");
  await registerByUi(page, user);

  await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeVisible();
  await signOutIfVisible(page);
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
});

test("web login shows error for wrong password", async ({ page }) => {
  const user = await registerNewMember(page);

  await resetBrowserSession(page);
  await openAuthEntry(page, "login");
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password").fill(`${user.password}x`);

  const responsePromise = waitForAuthResponse(page, "/auth/login", "POST");
  await page.locator("form button[type='submit']").first().click();

  const response = await responsePromise;
  expect(response).not.toBeNull();
  expect(response?.ok()).toBeFalsy();
  await expect(page.getByRole("main").getByRole("alert").first()).toBeVisible();
});

test("web authenticated home hides guest auth call-to-actions", async ({ page }) => {
  await registerNewMember(page);
  await gotoHome(page);

  await expect(page.getByRole("main").getByRole("heading", { name: "Your jobs and updates" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /create account|join now|sign up/i }).first()).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).not.toBeVisible();
});

test("web protected pages show sign-in card when signed out", async ({ page }) => {
  await resetBrowserSession(page);
  await clickMainNav(page, "Jobs");

  await expect(page.getByText("Sign in to continue").first()).toBeVisible();
  await expect(page.getByText("Sign in or create an account to continue.").first()).toBeVisible();
});

test("web jobs page shows validation feedback for short payload", async ({ page }) => {
  await registerNewMember(page);
  await openJobsSection(page, "posted");

  await page.getByLabel("Category").fill("p");
  await page.getByLabel("Location").fill("k");
  await page.getByLabel("Title").fill("abc");
  await page.getByLabel("Description").fill("Description is long enough for browser validation.");
  await page.getByRole("button", { name: "Post job" }).click();

  const errorBanner = page.getByRole("main").getByRole("alert").first();
  await expect(errorBanner).toBeVisible();
  await expect(errorBanner).toContainText(/must|longer|at least/i);
});

test("web jobs create form defaults visibility to public", async ({ page }) => {
  await registerNewMember(page);
  await openJobsSection(page, "posted");
  await expect(page.getByLabel("Visibility").first()).toHaveValue("public");
});

test("web jobs page posts a valid job", async ({ page }) => {
  const shortId = Date.now().toString(36).slice(-4);
  const jobTitle = `E2E job ${shortId}`;

  await registerNewMember(page);
  await openJobsSection(page, "posted");

  await page.getByLabel("Category").fill("plumber");
  await page.getByLabel("Location").fill("Kakkanad, Kochi");
  await page.getByLabel("Title").fill(jobTitle);
  await page.getByLabel("Description").fill("Need urgent kitchen sink leak repair service.");
  await page.getByRole("button", { name: "Post job" }).click();

  await waitForSuccessMessage(page, "Job posted successfully.");
  const card = jobCard(page, jobTitle);
  await expect(card).toBeVisible();
  await expect(card.getByText("Public").first()).toBeVisible();
  await card.getByRole("button", { name: "View approved media", exact: true }).click();
  await expect(card.getByText("No approved job media yet.")).toBeVisible();
});

test("web jobs page posts connections-only job and shows visibility in posted section", async ({
  page
}) => {
  const shortId = Date.now().toString(36).slice(-5);
  const jobTitle = `Connections-only ${shortId}`;
  await registerNewMember(page);
  await openJobsSection(page, "posted");

  await page.getByLabel("Category").fill("electrician");
  await page.getByLabel("Location").fill("Aluva, Kochi");
  await page.getByLabel("Title").fill(jobTitle);
  await page
    .getByLabel("Description")
    .fill("Connections-only posting for trusted-network visibility checks.");
  await page.getByRole("combobox", { name: /Visibility/i }).first().selectOption("connections_only");
  await page.getByRole("button", { name: "Post job" }).click();
  await waitForSuccessMessage(page, "Job posted successfully.");

  await page.getByRole("link", { name: jobTitle }).first().click();
  await expect(page.getByText("Visibility: Connections only").first()).toBeVisible();
});

test("web jobs page shows posted job under 'Jobs posted by me' with applicant-management action", async ({
  page
}) => {
  const shortId = Date.now().toString(36).slice(-5);
  const jobTitle = `Posted by me ${shortId}`;
  await registerNewMember(page);
  await openJobsSection(page, "posted");

  await page.getByLabel("Category").fill("plumber");
  await page.getByLabel("Location").fill("Kakkanad, Kochi");
  await page.getByLabel("Title").fill(jobTitle);
  await page
    .getByLabel("Description")
    .fill("Need support for leaking sink valve replacement in kitchen.");
  await page.getByRole("button", { name: "Post job" }).click();
  await waitForSuccessMessage(page, "Job posted successfully.");

  const targetJobCard = jobCard(page, jobTitle);
  await expect(targetJobCard).toBeVisible();
  await expect(targetJobCard.getByRole("button", { name: "Manage job" })).toBeVisible();
  await targetJobCard.getByRole("button", { name: "View approved media", exact: true }).click();
  await expect(targetJobCard.getByText("No approved job media yet.")).toBeVisible();
});

test("web jobs posted by me opens applicant manager with empty applicants state", async ({ page }) => {
  const shortId = Date.now().toString(36).slice(-5);
  const jobTitle = `Applicants empty ${shortId}`;
  await registerNewMember(page);
  await openJobsSection(page, "posted");

  await page.getByLabel("Category").fill("plumber");
  await page.getByLabel("Location").fill("Kakkanad, Kochi");
  await page.getByLabel("Title").fill(jobTitle);
  await page
    .getByLabel("Description")
    .fill("New posting to validate applicant manager empty state rendering.");
  await page.getByRole("button", { name: "Post job" }).click();
  await waitForSuccessMessage(page, "Job posted successfully.");

  const targetJobCard = jobCard(page, jobTitle);
  await expect(targetJobCard).toBeVisible();
  await targetJobCard.getByRole("button", { name: "Manage job" }).click();

  await expect(page).toHaveURL(/\/jobs\/.+$/);
  await expect(page.getByRole("heading", { name: "Applicants", exact: true })).toBeVisible();
  await expect(page.getByText("No applications yet").first()).toBeVisible();
  await expect(page.getByText("When people apply, review their profiles and messages here.").first()).toBeVisible();
  await page.getByRole("link", { name: "Back to jobs" }).click();
  await expect(page).toHaveURL(/\/jobs\/posted$/);
  await expect(page.getByRole("heading", { name: "Jobs posted by me", exact: true }).first()).toBeVisible();
});

test("web job detail uploads multiple job media images and videos", async ({ page }) => {
  const shortId = Date.now().toString(36).slice(-5);
  const jobTitle = `Job media ${shortId}`;
  await registerNewMember(page);
  await openJobsSection(page, "posted");

  await page.getByLabel("Category").fill("plumber");
  await page.getByLabel("Location").fill("Kakkanad, Kochi");
  await page.getByLabel("Title").fill(jobTitle);
  await page
    .getByLabel("Description")
    .fill("Need job media upload validation with images and videos.");
  await page.getByRole("button", { name: "Post job" }).click();
  await waitForSuccessMessage(page, "Job posted successfully.");

  const targetJobCard = jobCard(page, jobTitle);
  await expect(targetJobCard).toBeVisible();
  await targetJobCard.getByRole("button", { name: "Manage job" }).click();
  await expect(page).toHaveURL(/\/jobs\/.+$/);
  await expect(page.getByRole("heading", { name: "Job photos and videos" })).toBeVisible();

  await page.getByLabel("Choose job photos or videos").setInputFiles([commonsValveImage, sampleVideo]);
  await expect(page.getByTestId("job-media-upload-selected")).toContainText("2 selected files");
  await expect(page.getByTestId("job-media-upload-selected")).toContainText("1 photos");
  await expect(page.getByTestId("job-media-upload-selected")).toContainText("1 videos");
  await expect(page.getByText("commons-plumbing-valve.jpg").first()).toBeVisible();
  await expect(page.getByText("sample-video-640x360.mp4").first()).toBeVisible();
  await page.getByRole("button", { name: "Upload 2 files" }).click();
  await waitForSuccessMessage(page, "2 job files uploaded for review.");
  await expect(page.getByTestId("job-media-upload-selected")).toHaveCount(0);
  await expect(page.getByText("Choose job photos or videos", { exact: true })).toBeVisible();
});

test("web job cards show visibility and a management action", async ({ page }) => {
  await registerNewMember(page);
  await openJobsSection(page, "posted");

  await expect(page.getByRole("heading", { name: "Jobs posted by me", level: 1 })).toBeVisible();
  const title = "Inspect the dripping tap";
  await page.getByLabel("Category", { exact: true }).fill("Plumber");
  await page.getByLabel("Location", { exact: true }).fill("Kochi");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Description", { exact: true }).fill("Check the tap seal and replace the worn washer.");
  await page.getByRole("button", { name: "Post job", exact: true }).click();
  const record = jobCard(page, title);
  await expect(record).toBeVisible();
  await expect(record.getByRole("button", { name: "Manage job" })).toBeVisible();
  await expect(record.getByText("Visibility: Public", { exact: true })).toBeVisible();
});

test("web connections page validates empty query", async ({ page }) => {
  await registerNewMember(page);
  await clickMainNav(page, "People");

  await page.getByLabel("Find a person").fill("   ");
  await page.getByRole("button", { name: "Search people" }).click();
  await expect(page.getByText("Enter a name, member ID, service, or location.").first()).toBeVisible();
});

test("web notifications page lists unread connection alert and allows mark-read", async ({
  page
}) => {
  test.slow();
  await createConnectionAlert(page);
  await clickMainNav(page, "Alerts");

  await page.getByRole("button", { name: "Unread only" }).click();
  const unreadAlert = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Connection request", exact: true }) }).first();
  await expect(unreadAlert.getByRole("link", { name: "Open People" })).toBeVisible();
  const before = Number.parseInt(await page.getByTestId("alerts-unread-count").innerText(), 10);
  await unreadAlert.getByRole("button", { name: "Mark as read" }).click();
  await expect(page.getByTestId("alerts-unread-count")).toHaveText(`${before - 1} unread`);
});

test("web notifications page toggles unread filter labels", async ({ page }) => {
  await registerNewMember(page);
  await clickMainNav(page, "Alerts");

  const unread = page.getByRole("button", { name: "Unread only", exact: true });
  const all = page.getByRole("button", { name: "All alerts", exact: true });
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await unread.click();
  await expect(unread).toHaveAttribute("aria-pressed", "true");
  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
});

test("web notifications mark-all-read clears unread alerts after reload", async ({ page }) => {
  test.slow();
  await createConnectionAlert(page);
  await clickMainNav(page, "Alerts");

  const markAllButton = page.getByRole("button", { name: "Mark all as read" });
  await expect(markAllButton).toBeEnabled();
  await markAllButton.click();
  await expect(page.getByTestId("alerts-unread-count")).toHaveText("0 unread");
  await page.reload();
  await page.getByRole("button", { name: "Unread only", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No unread alerts" })).toBeVisible();
  await expect(markAllButton).toHaveCount(0);
});

test("web settings save appearance and analytics after reload", async ({ page }) => {
  await registerNewMember(page);
  await page.goto("/settings");

  const appearance = page.getByRole("group", { name: "Appearance" });
  const analyticsStatus = page.getByTestId("settings-analytics-status");
  await expect(analyticsStatus).toHaveText(/^Analytics (on|off)$/);
  const turnOff = page.getByRole("button", { name: "Turn off analytics" });
  if (await turnOff.isVisible()) await turnOff.click();
  await expect(analyticsStatus).toHaveText("Analytics off");
  await appearance.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Turn on analytics" }).click();
  await expect(analyticsStatus).toHaveText("Analytics on");

  await page.reload();
  await expect(appearance.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(analyticsStatus).toHaveText("Analytics on");
  await page.getByRole("button", { name: "Turn off analytics" }).click();
  await appearance.getByRole("button", { name: "Use device setting" }).click();
  await page.reload();
  await expect(analyticsStatus).toHaveText("Analytics off");
  await expect(appearance.getByRole("button", { name: "Use device setting" })).toHaveAttribute("aria-pressed", "true");
});

test("web connections search finds a member by service/location query", async ({ page }) => {
  test.slow();
  await registerNewMember(page);
  const providerPage = await page.context().browser()!.newPage();
  try {
    const provider = await registerNewMember(providerPage);
    await clickMainNav(providerPage, "Profile");
    await providerPage.getByRole("button", { name: "Edit profile", exact: true }).click();
    await providerPage.getByLabel("City").fill("Kochi");
    await providerPage.getByLabel("Area").fill("Kakkanad");
    await providerPage.getByLabel("Services you offer").fill("plumber");
    await providerPage.getByRole("button", { name: "Save profile" }).click();
    await waitForSuccessMessage(providerPage, "Profile updated.");

    await clickMainNav(page, "People");
    await page.getByLabel("Find a person").fill(`plumber kakkanad ${provider.username}`);
    await page.getByRole("button", { name: "Search people", exact: true }).click();
    const matches = page.getByRole("region", { name: "Search results" });
    await expect(matches.getByText(`Member ID: ${provider.username}`, { exact: true })).toBeVisible();
  } finally {
    await providerPage.close();
  }
});

test("web people page explains profile media privacy gate", async ({ page }) => {
  test.slow();
  await registerNewMember(page);
  const otherPage = await page.context().browser()!.newPage();
  try {
    const other = await registerNewMember(otherPage);
    await clickMainNav(page, "People");
    await page.getByLabel("Find a person", { exact: true }).fill(other.username);
    await page.getByRole("button", { name: "Search people", exact: true }).click();
    const result = page.getByRole("region", { name: "Search results" }).getByRole("article").filter({ hasText: other.username });
    await expect(result.getByRole("button", { name: "Send request" })).toBeVisible();
    await result.getByRole("button", { name: "View profile" }).click();
    await expect(page.getByRole("heading", { name: `${other.firstName} ${other.lastName}`, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText("No approved profile photos or videos are visible to you.")).toBeVisible();
  } finally {
    await otherPage.close();
  }
});

test("web consent page shows empty state when no consent activity exists", async ({ page }) => {
  await registerNewMember(page);
  await clickMainNav(page, "Privacy");

  await expect(page.getByRole("button", { name: /Shared by you/i })).toBeVisible();
  await page.getByRole("button", { name: /History/i }).click();
  await expect(page.getByText("No detail requests").first()).toBeVisible();
  await expect(page.getByText("No sharing history").first()).toBeVisible();
});

test("web profile page updates details", async ({ page }) => {
  await registerNewMember(page);
  await clickMainNav(page, "Profile");

  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Approved photos and videos/i })).toBeVisible();
  await expect(page.getByText(/Verification documents stay private/i)).toBeVisible();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("Area").fill("Kakkanad");
  await page.getByLabel("Services you offer").fill("plumber, electrician");
  await page.getByTestId("profile-phone-input").fill("+919812345678");
  await page.getByRole("button", { name: "Save profile" }).click();

  await waitForSuccessMessage(page, "Profile updated.");
});

test("web Help links to FAQ search and Privacy Policy section navigation", async ({ page }) => {
  await page.goto("/help");
  await declineMemberAnalytics(page);
  const navigation = page.getByRole("navigation", { name: "Help and policies" });
  await navigation.getByRole("link", { name: "FAQ", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search questions" });
  await search.fill("nonexistentqaanswer");
  await expect(page.getByRole("status")).toContainText("No matching questions");
  await page.getByRole("button", { name: "Clear search" }).click();
  await search.fill("public galleries");
  const question = page.getByText("Are my ID documents visible on my profile?", { exact: true });
  await question.click();
  await expect(page.getByText(/Your ID and verification documents stay private/)).toBeVisible();

  await navigation.getByRole("link", { name: "Privacy Policy", exact: true }).click();
  const sections = page.getByRole("navigation", { name: "Document sections" });
  await sections.getByRole("link", { name: "User rights and choices", exact: true }).click();
  await expect(page).toHaveURL(/#user-rights-and-choices$/);
  await expect(page.getByRole("heading", { name: "User rights and choices", exact: true })).toBeInViewport();
  await page.getByRole("link", { name: "Back to section list" }).click();
  await expect(page).toHaveURL(/#legal-sections$/);
  await expect(sections).toBeInViewport();
});
