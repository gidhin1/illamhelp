import { adminOrigin } from "../utils/audit-origins";
import { expect, test } from '@playwright/test';

test('authenticated admin displays at phone and desktop widths', async ({ page }, testInfo) => {
  test.skip(process.env.PW_MIGRATION_ADMIN !== 'true', 'Requires the local E2E admin fixture');
  test.setTimeout(90000);
  const username = process.env.E2E_ADMIN_USERNAME;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!username || !password) throw new Error('Missing local E2E admin credentials');

  const origin = adminOrigin;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/auth/login`);
  await page.getByLabel('Username or email').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review work' })).toBeVisible();

  const routes = [
    ['/', 'Review work'],
    ['/audit', 'Contact sharing and account activity'],
    ['/moderation', 'Review photos and videos'],
    ['/verifications', 'Review verification requests'],
  ];
  for (const width of [390, 1440]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      for (const [route, heading] of routes) {
        const display = await page.context().newPage();
        display.on('pageerror', error => errors.push(`${route}: ${error.message}`));
        try {
          await display.setViewportSize({ width, height: 900 });
          await display.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
          await display.goto(origin + route);
          await expect(display.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
          await expect(display.locator('html')).toHaveAttribute('data-theme', colorScheme);
          expect(await display.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
          if (process.env.PW_CAPTURE_DISPLAY === "true") await display.screenshot({
            path: testInfo.outputPath(`${route.slice(1) || 'dashboard'}-${width}-${colorScheme}.png`),
            fullPage: true,
          });
        } finally {
          await display.close();
        }
      }
    }
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible();
  expect(errors).toEqual([]);
});
