import { adminOrigin, memberOrigin } from "../utils/audit-origins";
import { test, expect } from '@playwright/test';

const targets = [
  { name: 'member', origin: memberOrigin, heading: 'Sign in to continue', routes: [
    '/jobs', '/jobs/discover', '/jobs/posted', '/jobs/assigned',
    '/jobs/ui-review', '/profile', '/profile/ui-review', '/connections',
    '/consent', '/notifications', '/verification', '/settings',
  ] },
  { name: 'admin', origin: adminOrigin, heading: 'Sign in required', routes: [
    '/', '/audit', '/moderation', '/verifications',
  ] },
];

// These cover only the signed-out state. Authenticated content uses a real UI login.
for (const target of targets) {
  for (const width of [390, 1440]) {
    for (const mode of ['light', 'dark'] as const) {
      test(`protected ${target.name} route sign-in displays ${mode} at ${width}px`, async ({ browser }, testInfo) => {
        for (const route of target.routes) {
          // A fresh page isolates Next prefetches from the preceding navigation.
          const context = await browser.newContext({
            viewport: { width, height: 900 }, colorScheme: mode, reducedMotion: 'reduce'
          });
          try {
            const page = await context.newPage();
            const errors: string[] = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(target.origin + route, { waitUntil: 'domcontentloaded' });
            await expect(page.getByRole('heading', { name: target.heading, exact: true })).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
            if (process.env.PW_CAPTURE_DISPLAY === "true") {
              await page.screenshot({ path: testInfo.outputPath(`${target.name}-${route.replaceAll('/', '-')}-${mode}-${width}.png`) });
            }
            expect(errors, route).toEqual([]);
          } finally {
            await context.close();
          }
        }
      });
    }
  }
}
