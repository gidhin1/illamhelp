import { expect, Page, test } from "@playwright/test";

function uniqueUserId(): string {
  return `mobile_flow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function openRegister(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Trusted help for everyday life.")).toBeVisible();
  await page.getByRole("tab", { name: "Register" }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
}

async function registerAccount(page: Page): Promise<void> {
  const userId = uniqueUserId();
  await openRegister(page);
  await page.getByLabel("First name").fill("Mobile");
  await page.getByLabel("Email").fill(`${userId}@example.com`);
  await page.getByLabel("User ID").fill(userId);
  await page.getByLabel("Password").fill("StrongPass#2026");
  await page.getByTestId("auth-register-legal-acceptance").click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Your next steps")).toBeVisible();
}

async function openDrawer(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByRole("button", { name: "Close navigation menu" })).toBeVisible();
}

async function openJobsSubmenu(page: Page): Promise<void> {
  const postedItem = page.getByTestId("drawer-nav-jobs-posted");
  if (!(await postedItem.isVisible())) {
    await page.getByTestId("drawer-nav-jobs-toggle").click();
  }
  await expect(postedItem).toBeVisible();
}

test("mobile full flow covers primary functional routes from authenticated shell", async ({ page }) => {
  await registerAccount(page);

  await openDrawer(page);
  await page.getByTestId("drawer-nav-people").click();
  await expect(page.getByText("Trusted people")).toBeVisible();
  await page.getByTestId("connections-request-submit").click();
  await expect(page.getByTestId("connections-error-banner")).toContainText(
    "Enter a name, member ID, service, or location."
  );

  await openDrawer(page);
  await page.getByTestId("drawer-nav-alerts").click();
  await expect(page.getByText("Stay updated")).toBeVisible();
  await expect(page.getByTestId("notifications-filter-toggle")).toBeVisible();

  await page.getByTestId("tab-privacy").click();
  await expect(page.getByText("Share contact details safely")).toBeVisible();
  await page.getByTestId("consent-view-ask").click();
  await expect(page.getByTestId("consent-request-submit")).toBeVisible();

  await page.getByTestId("tab-jobs-discover").click();
  await openDrawer(page);
  await openJobsSubmenu(page);
  await page.getByTestId("drawer-nav-jobs-posted").click();
  await expect(page.getByText("Create jobs, review applicants, and manage assignments.")).toBeVisible();
  await expect(page.getByText("Create job", { exact: true })).toBeVisible();

  await openDrawer(page);
  await openJobsSubmenu(page);
  await page.getByTestId("drawer-nav-jobs-assigned").click();
  await expect(
    page.getByText("Track the jobs you are responsible for and continue each lifecycle.")
  ).toBeVisible();

  await openDrawer(page);
  await openJobsSubmenu(page);
  await page.getByTestId("drawer-nav-jobs-discover").click();
  await expect(page.getByText("Discover work")).toBeVisible();
});

test("mobile full flow reaches settings/help placeholders and signs out", async ({ page }) => {
  await registerAccount(page);

  await openDrawer(page);
  await page.getByTestId("drawer-nav-settings").click();
  await expect(page.getByText("Account preferences")).toBeVisible();
  await expect(page.getByText("Open privacy controls")).toBeVisible();

  await openDrawer(page);
  await page.getByTestId("drawer-nav-help").click();
  await expect(page.getByText("Support and safety")).toBeVisible();
  await expect(page.getByText("Open alerts")).toBeVisible();

  await openDrawer(page);
  await page.getByTestId("drawer-signout").click();
  await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
});

test("mobile verification route supports doc-type switching and refresh interactions", async ({ page }) => {
  await registerAccount(page);

  await openDrawer(page);
  await page.getByTestId("drawer-nav-verify").click();
  await expect(page.getByText("Get verified")).toBeVisible();

  await page.getByTestId("verification-doc-type-business_license").click();
  await expect(page.getByTestId("verification-doc-type-business_license")).toBeVisible();

  await page.getByTestId("verification-doc-type-utility_bill").click();
  await expect(page.getByTestId("verification-doc-type-utility_bill")).toBeVisible();

  await page.getByTestId("verification-refresh").click();
  await expect(page.getByTestId("verification-submit")).toBeVisible();
});
