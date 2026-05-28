import { expect, Page, test } from "@playwright/test";

function uniqueUserId(): string {
  return `mobile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function openRegister(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Trusted help for everyday life.")).toBeVisible();
  await page.getByRole("tab", { name: "Register" }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
}

async function fillRegister(page: Page, userId: string): Promise<void> {
  await page.getByLabel("First name").fill("Mobile");
  await page.getByLabel("Email").fill(`${userId}@example.com`);
  await page.getByLabel("User ID").fill(userId);
  await page.getByLabel("Password").fill("StrongPass#2026");
}

async function registerAccount(page: Page): Promise<void> {
  await openRegister(page);
  await fillRegister(page, uniqueUserId());
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Trusted help, work, and people in one social-style flow.")).toBeVisible();
}

async function openPostedJobs(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await page.getByRole("button", { name: "Posted by me", exact: true }).click();
  await expect(page.getByText("Create job", { exact: true })).toBeVisible();
}

test("mobile registration validates a short user id in the UI", async ({ page }) => {
  await openRegister(page);
  await fillRegister(page, "ab");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("alert")).toContainText("User ID must be at least 3 characters.");
  await expect(page.getByLabel("User ID")).toHaveValue("ab");
});

test("mobile registration opens authenticated navigation and supports sign out", async ({ page }) => {
  await registerAccount(page);
  await page.getByRole("button", { name: "Open navigation menu" }).click();
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
  await expect(page.getByText(jobTitle)).toBeVisible();
  await expect(page.getByText("Visibility: Connections only")).toBeVisible();
});

test("mobile profile edits contact and service details through visible controls", async ({ page }) => {
  await registerAccount(page);
  await page.getByRole("button", { name: "Open profile" }).click();

  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("Area").fill("Kakkanad");
  await page.getByLabel("Services offered (comma separated)").fill("plumber, cleaner");
  await page.getByLabel("Phone", { exact: true }).fill("+919812345678");
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page.getByText("Profile updated.")).toBeVisible();
  await expect(page.getByText("Kochi")).toBeVisible();
  await expect(page.getByText("plumber")).toBeVisible();
});
