import { adminOrigin, memberOrigin } from "../utils/audit-origins";
import { declineMemberAnalytics } from "../utils/flow-helpers";
import { test, expect } from '@playwright/test';

for (const mode of ['light', 'dark'] as const) {
  for (const width of [360, 390, 768, 1024, 1440]) {
    test(`public surfaces ${mode} at ${width}px`, async ({ browser }, testInfo) => {
      const errors: string[] = [];
      const pages = [
        ...['/', '/auth/login', '/auth/register', '/help', '/faq', '/terms', '/privacy-policy'].map(route => ({
          url: memberOrigin + route,
          label: route === '/' ? 'home' : route.slice(1).replaceAll('/', '-'),
          route,
        })),
        { url: `${adminOrigin}/auth/login`, label: 'admin-login', route: '/auth/login' },
      ];
      for (const { url, label, route } of pages) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          colorScheme: mode,
          reducedMotion: 'reduce',
        });
        try {
          const page = await context.newPage();
          page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
          page.on('console', message => {
            if (message.type() === 'error' && /hydration|did not match|Minified React error/i.test(message.text())) {
              errors.push(`${label}: ${message.text()}`);
            }
          });
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await expect(page.getByRole('main')).toBeVisible();
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
          if (process.env.PW_CAPTURE_DISPLAY === "true") await page.screenshot({
            path: testInfo.outputPath(`${label}-${mode}-${width}.png`),
            fullPage: true,
          });
          if (route === '/') await declineMemberAnalytics(page);
          if (route === '/auth/login') {
            await expect(page.getByLabel('Username or email', { exact: true })).toBeVisible();
            await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('required', '');
          }
        } finally {
          await context.close();
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

test('theme preference survives reload and mobile drawer remains keyboard-dismissable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${memberOrigin}/auth/login`);
  await page.getByTestId('mobile-drawer-toggle').click();
  await page.getByRole('button', { name: 'dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByTestId('mobile-drawer-toggle').click();
  await expect(page.getByRole('button', { name: 'dark', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Navigation menu' })).not.toBeVisible();
});
