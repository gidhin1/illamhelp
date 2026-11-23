import { expect, Page, test } from "@playwright/test";

function uniqueUserId(): string {
  return `mobile_flow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function openRegister(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Find help at home\.\s*Find work nearby\./ })).toBeVisible();
  await page.getByRole("button", { name: "Decline analytics" }).click();
  await page.getByRole("tab", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
}

async function registerAccount(page: Page): Promise<void> {
  const userId = uniqueUserId();
  await openRegister(page);
  await page.getByLabel("First name").fill("Mobile");
  await page.getByLabel("Email").fill(`${userId}@example.com`);
  await page.getByLabel("Member ID").fill(userId);
  await page.getByLabel("Password").fill("StrongPass#2026");
  await page.getByTestId("auth-register-legal-acceptance").click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Your jobs and updates")).toBeVisible();
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
  await expect(page.getByText("Find members and manage your connections.")).toBeVisible();
  await page.getByTestId("connections-search-submit").click();
  await expect(page.getByTestId("connections-search-error")).toContainText(
    "Enter a name, member ID, service, or location."
  );

  await openDrawer(page);
  await page.getByTestId("drawer-nav-alerts").click();
  await expect(page.getByText("Your alerts")).toBeVisible();
  await expect(page.getByTestId("notifications-filter-toggle")).toBeVisible();

  await page.getByTestId("tab-privacy").click();
  await expect(page.getByRole("heading", { name: "Contact sharing", exact: true })).toBeVisible();
  await page.getByTestId("consent-view-ask").click();
  await expect(page.getByTestId("consent-request-submit")).toBeVisible();

  await page.getByTestId("tab-jobs-discover").click();
  await openDrawer(page);
  await openJobsSubmenu(page);
  await page.getByTestId("drawer-nav-jobs-posted").click();
  await expect(page.getByText("Post jobs, review applicants, and manage your bookings.")).toBeVisible();
  await expect(page.getByText("Create job", { exact: true })).toBeVisible();

  await openDrawer(page);
  await openJobsSubmenu(page);
  await page.getByTestId("drawer-nav-jobs-assigned").click();
  await expect(
    page.getByText("See the jobs assigned to you and track their progress.")
  ).toBeVisible();

  await openDrawer(page);
  await openJobsSubmenu(page);
  await page.getByTestId("drawer-nav-jobs-discover").click();
  await expect(page.getByText("Discover work")).toBeVisible();
});

test("mobile settings change appearance and open Help and FAQ before signing out", async ({ page }) => {
  await registerAccount(page);

  await openDrawer(page);
  await page.getByTestId("drawer-nav-settings").click();
  await expect(page.getByText("Account settings")).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage contact sharing" })).toBeVisible();
  const dark = page.getByRole("button", { name: "Dark", exact: true });
  const darkLabel = dark.getByText("Dark", { exact: true });
  const before = await darkLabel.evaluate(label => getComputedStyle(label).color);
  await dark.click();
  await expect(darkLabel).not.toHaveCSS("color", before);
  const activeColor = await darkLabel.evaluate(label => getComputedStyle(label).color);
  await expect(page.getByTestId("settings-analytics-status")).toHaveText("Analytics off");

  await openDrawer(page);
  await page.getByTestId("drawer-nav-help").click();
  await expect(page.getByRole("heading", { name: "Help center" })).toBeVisible();
  await page.getByTestId("legal-tab-faq").click();
  const search = page.getByTestId("legal-faq-search");
  await search.fill("noquestionsmatchthis");
  await expect(page.getByText(/No matching questions/)).toBeVisible();
  await page.getByTestId("legal-faq-clear").click();
  await expect(search).toHaveValue("");
  await expect(page.getByText("Can other users see my phone number or address?")).toBeVisible();
  await openDrawer(page);
  await page.getByTestId("drawer-nav-settings").click();
  await expect(darkLabel).toHaveCSS("color", activeColor);

  await openDrawer(page);
  await page.getByTestId("drawer-signout").click();
  await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
});

test("mobile verification route supports doc-type switching and refresh interactions", async ({ page }) => {
  await registerAccount(page);

  await openDrawer(page);
  await page.getByTestId("drawer-nav-verify").click();
  await expect(page.getByText("Verify your profile")).toBeVisible();

  const business = page.getByRole("radio", { name: "Business licence" });
  const utility = page.getByRole("radio", { name: "Utility bill" });
  const unselected = await utility.evaluate(option => getComputedStyle(option).backgroundColor);
  await business.click();
  await expect(business).not.toHaveCSS("background-color", unselected);

  await utility.click();
  await expect(utility).not.toHaveCSS("background-color", unselected);
  await expect(business).toHaveCSS("background-color", unselected);

  await page.getByTestId("verification-refresh").click();
  await expect(page.getByTestId("verification-submit")).toBeVisible();
});
