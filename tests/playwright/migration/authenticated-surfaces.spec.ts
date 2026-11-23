import { memberOrigin } from "../utils/audit-origins";
import { test, expect } from '@playwright/test';
import { registerAuditMember } from '../utils/flow-helpers';

// Opt in only with the real local API and Keycloak running. No seeded sessions.
test('authenticated web displays through real registration', async ({ page, browser }, testInfo) => {
  test.skip(process.env.PW_MIGRATION_AUTH !== 'true', 'Requires local API and Keycloak');
  test.setTimeout(240000);
  const origin = memberOrigin;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const user = await registerAuditMember(page, origin);

  const jobTitle = `Display QA job ${user.username}`;
  const composer = await page.context().newPage();
  composer.on('pageerror', error => errors.push(error.message));
  let jobPath: string | null;
  try {
    await composer.goto(`${origin}/jobs/posted`);
    await composer.getByLabel('Category', { exact: true }).fill('plumber');
    await composer.getByLabel('Location', { exact: true }).fill('Kakkanad, Kochi');
    await composer.getByLabel('Title', { exact: true }).fill(jobTitle);
    await composer.getByLabel('Description', { exact: true }).fill('Synthetic local job for UI display validation.');
    await composer.getByRole('button', { name: 'Post job', exact: true }).click();
    const detailLink = composer.getByRole('link', { name: jobTitle, exact: true });
    await expect(detailLink).toBeVisible();
    jobPath = await detailLink.getAttribute('href');
  } finally {
    await composer.close();
  }
  expect(jobPath).toMatch(/^\/jobs\/[^/]+$/);

  const routes = [
    ['/', 'Your jobs and updates'],
    ['/jobs/discover', 'Discover jobs'],
    ['/jobs/posted', 'Jobs posted by me'],
    ['/jobs/assigned', 'Jobs assigned to me'],
    ['/profile', 'Your profile'],
    ['/connections', 'People'],
    ['/consent', 'Contact sharing'],
    ['/notifications', 'Alerts'],
    ['/verification', 'Verify your profile'],
    ['/settings', 'Account settings'],
    [jobPath!, 'Manage this job'],
    [`/profile/${encodeURIComponent(user.username)}`, `${user.firstName} ${user.lastName}`],
  ];
  const storageState = await page.context().storageState();
  const widths = [390, 1440].filter((width) =>
    !process.env.PW_MIGRATION_WIDTH || String(width) === process.env.PW_MIGRATION_WIDTH
  );
  const themes = (['light', 'dark'] as const).filter((mode) =>
    !process.env.PW_MIGRATION_THEME || mode === process.env.PW_MIGRATION_THEME
  );
  expect(widths.length * themes.length).toBeGreaterThan(0);
  for (const width of widths) {
    for (const mode of themes) {
      for (const [route, heading] of routes) {
        // Start each route with the same authenticated storage in a fresh context.
        const displayContext = await browser.newContext({ storageState, viewport: { width, height: 900 } });
        const display = await displayContext.newPage();
        display.on('pageerror', error => errors.push(`${route}: ${error.message}`));
        try {
          await display.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
          await display.goto(origin + route, { waitUntil: "domcontentloaded" });
          await expect(display.locator('html')).toHaveAttribute('data-theme', mode);
          await expect(display.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
          await expect(display.getByRole('heading', { name: 'Sign in to continue', exact: true })).toHaveCount(0);
          if (route === jobPath) await expect(display.getByText(jobTitle, { exact: true }).first()).toBeVisible();
          if (route === '/') {
            await expect(display.getByRole('heading', { name: 'Account activity' })).toBeVisible();
            await expect(display.getByRole('heading', { name: jobTitle, exact: true })).toBeVisible();
          }
          if (route === '/profile') {
            await expect(display.getByRole('button', { name: 'Edit profile', exact: true })).toBeEnabled();
          }
          if (route === '/jobs/posted') {
            await expect(display.getByRole('link', { name: jobTitle, exact: true })).toBeVisible();
          }
          expect(await display.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          if (process.env.PW_CAPTURE_DISPLAY === "true") await display.screenshot({ path: testInfo.outputPath(`${route.replaceAll('/', '-')}-${width}-${mode}.png`) });
        } finally {
          await displayContext.close();
        }
      }
    }
  }
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to continue', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
