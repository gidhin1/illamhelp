import { expect, Page, test } from "@playwright/test";

function uniqueUserId(): string {
  return `mobile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function openRegister(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Find help at home\.\s*Find work nearby\./ })).toBeVisible();
  await page.getByRole("button", { name: "Decline analytics" }).click();
  await page.getByRole("tab", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
}

async function fillRegister(page: Page, userId: string): Promise<void> {
  await page.getByLabel("First name").fill("Mobile");
  await page.getByLabel("Email").fill(`${userId}@example.com`);
  await page.getByLabel("Member ID").fill(userId);
  await page.getByLabel("Password").fill("StrongPass#2026");
}

async function registerAccount(page: Page): Promise<void> {
  await openRegister(page);
  await fillRegister(page, uniqueUserId());
  await page.getByTestId("auth-register-legal-acceptance").click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Your jobs and updates")).toBeVisible();
}

async function openPostedJobs(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByTestId("drawer-nav-jobs-toggle").click();
  await page.getByRole("button", { name: "Posted by me", exact: true }).click();
  await expect(page.getByText("Create job", { exact: true })).toBeVisible();
}

test("mobile registration validates a short user id in the UI", async ({ page }) => {
  await openRegister(page);
  await fillRegister(page, "ab");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("alert")).toContainText("Enter a member ID with at least 3 characters.");
  await expect(page.getByLabel("Member ID")).toHaveValue("ab");
});

test("mobile registration opens authenticated navigation and supports sign out", async ({ page }) => {
  await registerAccount(page);
  await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
  await expect(page.getByTestId("tab-jobs-discover")).toBeVisible();
  await expect(page.getByTestId("tab-privacy")).toBeVisible();
  await expect(page.getByTestId("tab-profile")).toBeVisible();
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByTestId("drawer-nav-people")).toBeVisible();
  await expect(page.getByTestId("drawer-nav-verify")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
});

test("mobile posted jobs validates the draft then creates a connections-only job", async ({ page }) => {
  const jobTitle = `Mobile job ${Date.now().toString(36).slice(-5)}`;
  await registerAccount(page);
  await openPostedJobs(page);

  await page.getByLabel("Category").fill("p");
  await page.getByLabel("Title").fill("fix");
  await page.getByLabel("Description").fill("short");
  await page.getByLabel("Location").fill("x");
  await page.getByRole("button", { name: "Post job" }).click();
  await expect(page.getByRole("alert")).toContainText("Category must be at least 2 characters");

  await page.getByLabel("Category").fill("plumber");
  await page.getByLabel("Title").fill(jobTitle);
  await page.getByLabel("Description").fill("Need trusted assistance to repair a leaking sink.");
  await page.getByLabel("Location").fill("Kochi");
  await page.getByTestId("jobs-visibility-connections").click();
  await page.getByRole("button", { name: "Post job" }).click();

  await expect(page.getByText("Job posted.")).toBeVisible();
  await expect(page.getByText(jobTitle, { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Visibility: Connections only")).toBeVisible();
});

test("mobile profile edits contact and service details through visible controls", async ({ page }) => {
  await registerAccount(page);
  await page.getByRole("button", { name: "Open profile" }).click();

  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("Area").fill("Kakkanad");
  await page.getByLabel("Services you offer (separated by commas)").fill("plumber, cleaner");
  await page.getByLabel("Phone", { exact: true }).fill("+919812345678");
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page.getByText("Profile updated.")).toBeVisible();
  await expect(page.getByText("Kochi")).toBeVisible();
  await expect(page.getByText("plumber")).toBeVisible();
});

test("mobile verification requires an uploaded private document before submission", async ({ page }) => {
  await registerAccount(page);
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByTestId("drawer-nav-verify").click();

  await expect(page.getByRole("heading", { name: "Verify your profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add private document" })).toBeEnabled();
  await expect(page.getByText("Upload a private document to enable submission.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit verification request" })).toBeDisabled();
});

test("mobile registration keeps draft and consent when closing a policy", async ({ page }) => {
  await openRegister(page);
  await page.getByLabel("First name").fill("Registration draft");
  for (const [control, heading] of [
    ["auth-open-terms", "Terms and Conditions"],
    ["auth-open-privacy-policy", "Privacy Policy"],
    ["auth-open-faq", "Frequently asked questions"]
  ]) {
    await page.getByTestId(control).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByLabel("First name")).toHaveValue("Registration draft");
    await expect(page.getByTestId("auth-register-legal-acceptance")).not.toBeChecked();
  }
});

test("mobile navigation drawer opens and closes from explicit controls", async ({ page }) => {
  await registerAccount(page);

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByRole("button", { name: "Close navigation menu" })).toBeVisible();
  await expect(page.getByTestId("app-drawer-scrim")).toBeVisible();
  await expect(page.getByTestId("drawer-signout")).toBeVisible();
  await expect(page.getByTestId("theme-system")).toBeVisible();

  const viewport = page.viewportSize();
  const closeX = Math.max((viewport?.width ?? 390) - 12, 12);
  await page.getByTestId("app-drawer-scrim").click({ force: true, position: { x: closeX, y: 24 } });
  await expect(page.getByRole("button", { name: "Close navigation menu" })).not.toBeVisible();
});

test("mobile header profile shortcut opens profile screen", async ({ page }) => {
  await registerAccount(page);
  await page.getByRole("button", { name: "Open profile" }).click();

  await expect(page.getByText("Your profile", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit profile", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save profile" })).toHaveCount(0);
  await expect(page.getByTestId("profile-signout")).toBeVisible();
});
