import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { adminOrigin, memberOrigin } from "../utils/audit-origins";
import { registerAuditMember } from "../utils/flow-helpers";

const authenticated = process.env.PW_MIGRATION_AUTH === "true";
const admin = { username: process.env.E2E_ADMIN_USERNAME, password: process.env.E2E_ADMIN_PASSWORD };

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [390, 1440]) {
    test.describe(`${colorScheme} at ${width}px`, () => {
      test.use({ colorScheme, contextOptions: { reducedMotion: "reduce" }, viewport: { width, height: 844 } });

      test("member and admin recover from an unknown address", async ({ page }) => {
        for (const [origin, link] of [[memberOrigin, "Go to home"], [adminOrigin, "Go to dashboard"]]) {
          const response = await page.goto(`${origin}/missing-page`);
          expect(response?.status()).toBe(404);
          const main = page.getByRole("main");
          await expect(main.getByRole("heading", { name: "Page not found", level: 1 })).toBeVisible();
          await expect(main.getByRole("link", { name: link })).toHaveAttribute("href", "/");
        }
      });

      test("sign-in guidance has a heading at the right level", async ({ page }) => {
        await page.goto(`${memberOrigin}/profile`);
        await expect(page.getByRole("heading", { name: "Your profile", level: 1 })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Sign in to continue", level: 2 })).toBeVisible();
        await page.goto(`${adminOrigin}/moderation`);
        await expect(page.getByRole("heading", { name: "Sign in required", level: 1 })).toBeVisible();
      });

      test("People search handles Enter and never sends a connection request", async ({ page }) => {
        test.skip(!authenticated, "Requires local API and Keycloak");
        await registerAuditMember(page, memberOrigin);
        const connectionRequests: string[] = [];
        page.on("request", (request) => {
          if (request.url().endsWith("/connections/request")) connectionRequests.push(request.method());
        });
        await page.goto(`${memberOrigin}/connections`);
        const query = page.getByLabel("Find a person", { exact: true });
        await query.press("Enter");
        await expect(page.getByRole("main").getByRole("alert")).toHaveText("Enter a name, member ID, service, or location.");
        await query.fill("no_matching_member_pwaudit");
        await query.press("Enter");
        await expect(page.getByText(/No people found/)).toBeVisible();
        expect(connectionRequests).toEqual([]);
      });

      test("Verify requires a private document before submission", async ({ page }) => {
        test.skip(!authenticated, "Requires local API and Keycloak");
        await registerAuditMember(page, memberOrigin);
        await page.goto(`${memberOrigin}/verification`);
        await expect(page.getByRole("heading", { name: "Verify your profile" })).toBeVisible();
        await expect(page.getByLabel("Choose private verification document")).toBeAttached();
        await expect(page.getByRole("button", { name: "Submit verification request" })).toBeDisabled();
      });

      test("Jobs tabs pass contrast and Profile shows one identity", async ({ page }, testInfo) => {
        test.skip(!authenticated, "Requires local API and Keycloak");
        await registerAuditMember(page, memberOrigin);
        await page.goto(`${memberOrigin}/jobs/discover`);
        await expect(page.getByRole("heading", { name: "Jobs from connections", level: 2 })).toBeVisible();
        const contrast = await new AxeBuilder({ page })
          .include('nav[aria-label="Job workspace sections"]')
          .withRules(["color-contrast"]).analyze();
        expect(contrast.violations).toEqual([]);

        await page.goto(`${memberOrigin}/profile`);
        await expect(page.getByRole("button", { name: "Edit profile" })).toBeEnabled();
        const identity = page.getByRole("region", { name: await page.locator("#profile-identity-heading").innerText(), exact: true });
        await expect(identity.getByText(/^Member ID:/)).toHaveCount(1);
        await page.getByRole("button", { name: "Edit profile" }).click();
        await expect(page.getByRole("heading", { name: "Edit profile" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        if (process.env.PW_CAPTURE_DISPLAY === "true") await page.screenshot({ path: testInfo.outputPath("profile-editor.png") });

        if (width === 390) {
          const open = page.getByRole("button", { name: "Open navigation" });
          await open.click();
          const drawer = page.getByRole("dialog", { name: "Navigation menu" });
          await expect(drawer).toBeVisible();
          if (process.env.PW_CAPTURE_DISPLAY === "true") await page.screenshot({ path: testInfo.outputPath("navigation-drawer.png") });
          await page.keyboard.press("Escape");
          await expect(drawer).toHaveCount(0);
        }
      });

      test("staff can read and open review rows at both widths", async ({ page }, testInfo) => {
        test.skip(!admin.username || !admin.password, "Requires the temporary local admin fixture");
        await page.goto(`${adminOrigin}/auth/login`);
        await expect(page.getByRole("navigation", { name: "Admin navigation" })).toHaveCount(0);
        await page.getByLabel("Username or email").fill(admin.username!);
        await page.getByLabel("Password", { exact: true }).fill(admin.password!);
        await page.getByRole("main").getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Review work", exact: true })).toBeVisible();
        for (const [route, queueName, detailId] of [
          ["/moderation", "Moderation queue", "moderation-details-panel"],
          ["/verifications", "Verification requests", "verification-review-panel"],
        ]) {
          await page.goto(adminOrigin + route);
          const row = page.getByRole("region", { name: queueName, exact: true }).getByRole("button").first();
          await expect(row).toBeVisible();
          await expect(row).toHaveCSS("display", "grid");
          const [viewportWidth, rowRight] = await row.evaluate(node => [document.documentElement.clientWidth, node.getBoundingClientRect().right]);
          expect(rowRight).toBeLessThanOrEqual(viewportWidth + 1);
          await row.click();
          const details = page.getByTestId(detailId);
          await expect(details).toBeVisible();
          if (width < 768) {
            await expect(row).toBeHidden();
            await expect(details.getByRole("heading", { level: 2 })).toBeFocused();
            await expect(details.getByRole("heading", { level: 2 })).toBeInViewport();
          }
          if (route === "/moderation") {
            await expect(details.getByRole("button", { name: "Preview upload", exact: true })).toBeVisible();
            await expect(details.locator("img, video")).toHaveCount(0);
          }
          if (process.env.PW_CAPTURE_DISPLAY === "true") await page.screenshot({ path: testInfo.outputPath(route.slice(1) + "-review.png") });
          if (width < 768) {
            await details.getByRole("button", { name: "Back to queue", exact: true }).click();
            await expect(row).toBeFocused();
          }
          await expect(row).toHaveAttribute("aria-pressed", "true");
        }
      });
    });
  }
}

test("analytics choice fits above mobile navigation at short heights", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 440 });
  await page.goto(`${memberOrigin}/auth/login`);
  const banner = page.getByRole("complementary", { name: "Analytics privacy choice" });
  await expect(banner).toBeVisible();
  const nav = page.locator(".mobile-bottom-nav");
  expect((await banner.boundingBox())!.y + (await banner.boundingBox())!.height)
    .toBeLessThanOrEqual((await nav.boundingBox())!.y);
  await banner.getByRole("button", { name: "View analytics settings" }).click();
  await banner.getByRole("button", { name: "Decline analytics" }).click();
  await expect(banner).toHaveCount(0);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`desktop Home analytics banner gives its text room in ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 808 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto(memberOrigin + "/");

    const banner = page.getByRole("complementary", { name: "Analytics privacy choice" });
    await expect(banner).toBeVisible();
    const layout = await banner.evaluate(element => {
      const box = element.getBoundingClientRect();
      const description = element.querySelector("p")!.getBoundingClientRect();
      const actions = element.querySelector(".analytics-consent-actions")!.getBoundingClientRect();
      return { height: box.height, textWidth: description.width, textBottom: description.bottom, actionsTop: actions.top };
    });
    expect(layout.textWidth).toBeGreaterThan(400);
    expect(layout.actionsTop).toBeGreaterThanOrEqual(layout.textBottom);
    expect(layout.height).toBeLessThan(240);

    const settings = banner.getByRole("button", { name: "View analytics settings" });
    await settings.click();
    await expect(settings).toHaveAttribute("aria-expanded", "true");
    await expect(banner.getByText(/Ad storage stays off/)).toBeVisible();
    await settings.click();
    await expect(settings).toHaveAttribute("aria-expanded", "false");
    await expect(banner.getByText(/Ad storage stays off/)).toBeHidden();

    const allow = colorScheme === "light";
    await banner.getByRole("button", { name: allow ? "Allow analytics" : "Decline analytics" }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(banner).toHaveCount(0);
  });
}

for (const hasTouch of [false, true]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`media pickers on ${hasTouch ? "phone" : "desktop"} in ${colorScheme}`, () => {
      test.use({
        hasTouch, colorScheme, contextOptions: { reducedMotion: "reduce" },
        viewport: { width: hasTouch ? 390 : 1440, height: 844 }
      });

      test("Profile and Jobs media pickers fit and open the native file chooser", async ({ page }) => {
        test.skip(!authenticated, "Requires local API and Keycloak");
        const member = await registerAuditMember(page, memberOrigin);
        await page.goto(`${memberOrigin}/jobs/posted`);
        const jobTitle = `Picker check ${member.username}`;
        await page.getByLabel("Category", { exact: true }).fill("Plumber");
        await page.getByLabel("Title", { exact: true }).fill(jobTitle);
        await page.getByLabel("Description", { exact: true }).fill("Inspect the kitchen tap and replace the washer.");
        await page.getByLabel("Location", { exact: true }).fill("Kochi");
        await page.getByRole("button", { name: "Post job", exact: true }).click();
        await expect(page.getByRole("link", { name: jobTitle, exact: true })).toBeVisible();
        await page.goto(`${memberOrigin}/profile`);
        const profilePanel = page.getByTestId("profile-media-upload");
        const profilePicture = page.getByText("Choose profile picture", { exact: true });
        await expect(profilePicture).toBeVisible();

        for (const [uploadPanel, pickerLabel] of [
          [profilePanel, "Choose photos or videos"],
          [page.getByTestId("job-media-upload"), "Choose job photos or videos"]
        ] as const) {
          if (uploadPanel !== profilePanel) {
            await page.goto(`${memberOrigin}/jobs/posted`);
            await page.getByRole("link", { name: jobTitle, exact: true }).click();
          }

          const picker = uploadPanel.getByText(pickerLabel, { exact: true });
          const photo = uploadPanel.getByText("Take a photo", { exact: true });
          const video = uploadPanel.getByText("Record a video", { exact: true });
          await expect(picker).toBeVisible();
          if (hasTouch) {
            await expect(photo).toBeVisible();
            await expect(video).toBeVisible();
            await expect(uploadPanel.getByLabel("Take a photo", { exact: true })).toHaveAttribute("accept", "image/*");
            await expect(uploadPanel.getByLabel("Record a video", { exact: true })).toHaveAttribute("accept", "video/*");
          } else {
            await expect(photo).toBeHidden();
            await expect(video).toBeHidden();
          }
          const layout = await picker.evaluate(text => {
            const button = text.parentElement!.getBoundingClientRect();
            const heading = text.closest(".media-upload-panel")!.querySelector("h3")!.getBoundingClientRect();
            return { height: button.height, startsBelowHeading: button.top >= heading.bottom };
          });
          expect(layout.height).toBeGreaterThanOrEqual(44);
          expect(layout.height).toBeLessThanOrEqual(72);
          expect(layout.startsBelowHeading).toBe(true);

          const chooserEvent = page.waitForEvent("filechooser");
          if (hasTouch) {
            await picker.tap();
          } else {
            await uploadPanel.getByLabel(pickerLabel, { exact: true }).press("Enter");
          }
          const chooser = await chooserEvent;
          expect(chooser.isMultiple()).toBe(true);
          await chooser.setFiles({
            name: "picker-test.png", mimeType: "image/png",
            buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/dmcAAAAASUVORK5CYII=", "base64"),
          });
          await expect(uploadPanel.getByText("picker-test.png")).toBeVisible();
          await expect(uploadPanel.getByRole("button", { name: "Upload for review" })).toBeEnabled();
          await uploadPanel.getByRole("button", { name: "Clear selection" }).click();
          await expect(uploadPanel.getByText("picker-test.png")).toHaveCount(0);
        }
      });
    });
  }
}
