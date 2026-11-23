import { adminOrigin, memberOrigin } from "../utils/audit-origins";
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} accessibility`, () => {
    test.use({ colorScheme, contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 390, height: 844 } });
    for (const [surface, url] of [
      ['login', `${memberOrigin}/auth/login`],
      ['registration', `${memberOrigin}/auth/register`],
      ['help', `${memberOrigin}/help`],
      ['admin login', `${adminOrigin}/auth/login`],
    ]) {
      test(`${surface} has no automated WCAG AA violations`, async ({ page }) => {
        await page.goto(url);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.evaluate(async () => {
          const finiteAnimations = document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity);
          await Promise.all(finiteAnimations.map(animation => animation.finished.catch(() => undefined)));
        });
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))).toEqual([]);
      });
    }
  });
}

test('login keyboard sequence and navigation links remain usable', async ({ page, browserName }) => {
  await page.goto(`${memberOrigin}/auth/login`);
  await page.getByLabel('Username or email', { exact: true }).focus();
  await page.keyboard.type('keyboard-check');
  const nextControl = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.keyboard.press(nextControl);
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.keyboard.press(nextControl);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeFocused();
  await page.keyboard.press(nextControl);
  await expect(page.getByRole('main').getByRole('link', { name: 'Create account', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/auth\/register$/);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('checkbox')).toBeChecked();
});
