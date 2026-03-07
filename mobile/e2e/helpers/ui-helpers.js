const MEMBER_ID_PATTERN = /[a-z0-9._-]{3,40}/i;
const DETOX_VERIFY_TYPED_INPUT = /^(1|true)$/i.test(
  process.env.DETOX_VERIFY_TYPED_INPUT ?? "false"
);
const DETOX_SCROLL_STEP_PX = Number(process.env.DETOX_SCROLL_STEP_PX ?? "220");
const DETOX_VISIBLE_CHECK_TIMEOUT_MS = Number(process.env.DETOX_VISIBLE_CHECK_TIMEOUT_MS ?? "200");
const DETOX_IOS_PROMPT_CHECK_TIMEOUT_MS = Number(
  process.env.DETOX_IOS_PROMPT_CHECK_TIMEOUT_MS ?? "80"
);
const AUTH_RATE_LIMIT_RE = /too many authentication attempts|http 429|try again shortly/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStep(message) {
  console.log(`[e2e][mobile] ${message}`);
}

function parseMemberId(value, context) {
  const normalized = String(value)
    .replace(/^member id:\s*/i, "")
    .replace(/^user id:\s*/i, "")
    .trim();
  const match = normalized.match(MEMBER_ID_PATTERN);
  if (!match) {
    throw new Error(`Unable to parse member ID for ${context}. Value: ${value}`);
  }
  return match[0];
}

function makeUser(userType) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(-8);
  return {
    userType,
    firstName: userType === "seeker" ? "Se" : "Pr",
    lastName: "E2E",
    email: `${userType}.${suffix}@example.com`,
    username: `${userType}${suffix}`,
    password: `T!${suffix}9a`
  };
}

function isRateLimitError(error) {
  return AUTH_RATE_LIMIT_RE.test(error instanceof Error ? error.message : String(error));
}

async function withRateLimitRetry(action, actionName, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= maxAttempts || !isRateLimitError(error)) {
        throw error;
      }
      logStep(`${actionName}: retrying after rate limit (attempt ${attempt})`);
      await sleep(1200 * attempt);
    }
  }
}

async function isVisibleById(targetId, timeoutMs = DETOX_VISIBLE_CHECK_TIMEOUT_MS) {
  try {
    await waitFor(element(by.id(targetId))).toBeVisible().withTimeout(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

async function isVisibleByText(text, timeoutMs = DETOX_VISIBLE_CHECK_TIMEOUT_MS) {
  try {
    await waitFor(element(by.text(text))).toBeVisible().withTimeout(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

async function scrollToTop(scrollId) {
  try {
    await element(by.id(scrollId)).scrollTo("top");
  } catch {
    // no-op
  }
}

async function scrollToBottom(scrollId) {
  try {
    await element(by.id(scrollId)).scrollTo("bottom");
  } catch {
    // no-op
  }
}

async function dismissKeyboardOverlay() {
  const surfaces = [
    "auth-scroll",
    "home-scroll",
    "notifications-scroll",
    "jobs-scroll",
    "connections-scroll",
    "consent-scroll",
    "profile-scroll",
    "verification-scroll"
  ];

  for (const surfaceId of surfaces) {
    try {
      await element(by.id(surfaceId)).tap({ x: 6, y: 6 });
      return;
    } catch {
      // no-op
    }
  }
}

async function isVisibleByMatcher(matcher, timeoutMs) {
  try {
    await waitFor(element(matcher)).toBeVisible().withTimeout(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

async function tapFirstVisible(matchers, waitTimeoutMs) {
  for (const matcher of matchers) {
    if (await isVisibleByMatcher(matcher, waitTimeoutMs)) {
      await element(matcher).tap();
      return true;
    }
  }
  return false;
}

async function dismissIosPasswordPromptIfPresent() {
  if (device.getPlatform() !== "ios") {
    return false;
  }

  const alertVisible = await tapFirstVisible(
    [by.type("XCUIElementTypeAlert"), by.type("_UIAlertControllerView")],
    DETOX_IOS_PROMPT_CHECK_TIMEOUT_MS
  );

  if (!alertVisible) {
    return false;
  }

  const dismissMatchers = [
    by.text("Not Now"),
    by.label("Not Now"),
    by.text("Not now"),
    by.label("Not now"),
    by.text("Don’t Save"),
    by.label("Don’t Save"),
    by.text("Don't Save"),
    by.label("Don't Save")
  ];

  if (await tapFirstVisible(dismissMatchers, 120)) {
    return true;
  }

  const fallbackMatchers = [
    by.type("_UIAlertControllerActionView").atIndex(0),
    by.type("XCUIElementTypeButton").atIndex(0)
  ];

  return tapFirstVisible(fallbackMatchers, 80);
}

async function settleIosPasswordPromptIfPresent() {
  if (device.getPlatform() !== "ios") {
    return;
  }

  let clearRounds = 0;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const dismissed = await dismissIosPasswordPromptIfPresent();
    if (dismissed) {
      clearRounds = 0;
    } else {
      clearRounds += 1;
      if (clearRounds >= 2) {
        return;
      }
    }
    await sleep(80);
  }
}

async function ensureVisible(targetId, scrollId) {
  if (!scrollId) {
    await waitFor(element(by.id(targetId))).toBeVisible().withTimeout(20000);
    return;
  }

  if (await isVisibleById(targetId, 300)) {
    return;
  }

  await dismissKeyboardOverlay();
  await scrollToTop(scrollId);

  try {
    await waitFor(element(by.id(targetId)))
      .toBeVisible()
      .withTimeout(12000)
      .whileElement(by.id(scrollId))
      .scroll(DETOX_SCROLL_STEP_PX, "down");
    return;
  } catch {
    await scrollToBottom(scrollId);
  }

  await waitFor(element(by.id(targetId))).toBeVisible().withTimeout(6000);
}

async function waitForTextInScroll(text, scrollId, timeoutMs = 30000) {
  await scrollToTop(scrollId);

  try {
    await waitFor(element(by.text(text)))
      .toBeVisible()
      .withTimeout(timeoutMs)
      .whileElement(by.id(scrollId))
      .scroll(140, "down");
    return;
  } catch {
    await scrollToBottom(scrollId);
    await waitFor(element(by.text(text))).toBeVisible().withTimeout(5000);
  }
}

async function tapByTextInScroll(text, scrollId, timeoutMs = 30000) {
  await waitForTextInScroll(text, scrollId, timeoutMs);
  await element(by.text(text)).atIndex(0).tap();
}

async function assertTextNotVisible(text, timeoutMs = 2000) {
  try {
    await waitFor(element(by.text(text))).toBeVisible().withTimeout(timeoutMs);
    throw new Error(`Text '${text}' unexpectedly visible`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("unexpectedly visible")) {
      throw error;
    }
  }
}

async function assertElementNotExistsById(targetId) {
  await expect(element(by.id(targetId))).not.toExist();
}

async function readElementTextById(targetId) {
  const attrs = await element(by.id(targetId)).getAttributes();
  const value = attrs.text ?? attrs.label ?? attrs.value;
  if (Array.isArray(value)) {
    return value.join(" ").trim();
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return JSON.stringify(attrs);
}

async function typeById(targetId, value, scrollId) {
  await dismissKeyboardOverlay();
  const expected = String(value);

  await ensureVisible(targetId, scrollId);
  await element(by.id(targetId)).tap();
  await element(by.id(targetId)).replaceText(expected);

  if (!DETOX_VERIFY_TYPED_INPUT) {
    return;
  }

  const finalValue = await readElementTextById(targetId);
  if (finalValue !== expected) {
    await element(by.id(targetId)).replaceText(expected);
  }
}

async function tapById(targetId, scrollId) {
  await dismissKeyboardOverlay();
  await ensureVisible(targetId, scrollId);

  try {
    await element(by.id(targetId)).tap();
    return;
  } catch {
    if (scrollId) {
      try {
        await element(by.id(scrollId)).scroll(120, "up");
      } catch {
        // no-op
      }
    }
  }

  await ensureVisible(targetId, scrollId);
  await element(by.id(targetId)).tap();
}

async function tapRegisterSubmitButton() {
  await dismissKeyboardOverlay();
  await scrollToBottom("auth-scroll");
  await tapById("auth-register-submit", "auth-scroll");
}

async function tapTab(tabKey) {
  await settleIosPasswordPromptIfPresent();
  await tapById(`tab-${tabKey}`);
  await settleIosPasswordPromptIfPresent();
}

async function waitForText(text, timeoutMs = 30000) {
  await waitFor(element(by.text(text))).toBeVisible().withTimeout(timeoutMs);
}

async function waitForSuccessOrError(successBannerId, errorBannerIds = [], timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  const allErrorBannerIds = ["auth-error-banner", ...errorBannerIds];

  while (Date.now() < deadline) {
    if (await isVisibleById(successBannerId, 250)) {
      return;
    }

    for (const errorBannerId of allErrorBannerIds) {
      if (await isVisibleById(errorBannerId, 120)) {
        const errorMessage = await readElementTextById(errorBannerId);
        throw new Error(`Action failed (${errorBannerId}): ${errorMessage}`);
      }
    }

    await sleep(180);
  }

  throw new Error(
    `Timed out waiting for success banner "${successBannerId}". Checked errors: ${allErrorBannerIds.join(", ")}`
  );
}

async function waitForHomeOrAuthError(actionName) {
  const deadline = Date.now() + 45000;

  while (Date.now() < deadline) {
    if (await isVisibleById("tab-home", 1200)) {
      return;
    }

    if (await isVisibleById("auth-error-banner", 250)) {
      const message = await readElementTextById("auth-error-banner");
      throw new Error(`Auth ${actionName} failed: ${message}`);
    }

    await sleep(180);
  }

  throw new Error(
    `Auth ${actionName} timed out: tab-home never appeared and no auth-error-banner was visible.`
  );
}

async function signOutIfVisible() {
  await settleIosPasswordPromptIfPresent();

  if (!(await isVisibleById("app-signout", 1200))) {
    return;
  }

  await tapById("app-signout");
  await settleIosPasswordPromptIfPresent();
  await waitFor(element(by.id("auth-mode-login"))).toBeVisible().withTimeout(15000);
}

async function waitForAuthEntryPoint() {
  await settleIosPasswordPromptIfPresent();

  if (await isVisibleById("auth-mode-register", 30000)) {
    return;
  }

  if (await isVisibleById("auth-mode-login", 10000)) {
    return;
  }

  if (await isVisibleById("tab-home", 10000)) {
    await signOutIfVisible();
    if (await isVisibleById("auth-mode-register", 20000)) {
      return;
    }
  }

  throw new Error(
    "Auth entrypoint did not appear. App may not have loaded UI yet. Check mobile/artifacts/detox/android-app.log and android-anr.log."
  );
}

async function registerByUi(user) {
  await withRateLimitRetry(async () => {
    await waitForAuthEntryPoint();
    await tapById("auth-mode-register", "auth-scroll");
    await typeById("auth-register-first-name", user.firstName, "auth-scroll");
    await typeById("auth-register-last-name", user.lastName, "auth-scroll");
    await typeById("auth-register-email", user.email, "auth-scroll");
    await typeById("auth-register-username", user.username, "auth-scroll");
    await typeById("auth-register-phone", "+919812345678", "auth-scroll");
    await typeById("auth-register-password", user.password, "auth-scroll");
    await tapRegisterSubmitButton();
    await waitForHomeOrAuthError("register");
    await settleIosPasswordPromptIfPresent();
  }, "register");
}

async function loginByUi(user) {
  await withRateLimitRetry(async () => {
    await waitForAuthEntryPoint();
    await tapById("auth-mode-login", "auth-scroll");
    await typeById("auth-login-username", user.username, "auth-scroll");
    await typeById("auth-login-password", user.password, "auth-scroll");
    await tapById("auth-login-submit", "auth-scroll");
    await waitForHomeOrAuthError("login");
    await settleIosPasswordPromptIfPresent();
  }, "login");
}

async function seedUserAndLoginByUi(user) {
  await signOutIfVisible();
  await registerByUi(user);
}

async function readProfileUserId() {
  await tapTab("profile");
  await waitFor(element(by.id("profile-user-id"))).toBeVisible().withTimeout(20000);
  const attrs = await element(by.id("profile-user-id")).getAttributes();
  const text = attrs.text ?? attrs.label ?? attrs.value ?? "";
  return parseMemberId(text, "profile user id");
}

async function createJobByUi({ category, title, description, locationText, visibility = "public" }) {
  await tapTab("jobs");
  await scrollToTop("jobs-scroll");
  await typeById("jobs-category", category, "jobs-scroll");
  await typeById("jobs-title", title, "jobs-scroll");
  await typeById("jobs-description", description, "jobs-scroll");
  await typeById("jobs-location", locationText, "jobs-scroll");

  if (visibility === "connections_only") {
    await tapById("jobs-visibility-connections", "jobs-scroll");
  } else {
    await tapById("jobs-visibility-public", "jobs-scroll");
  }

  await tapById("jobs-submit", "jobs-scroll");
  await waitForSuccessOrError("jobs-success-banner", ["jobs-submit-error-banner", "jobs-error-banner"]);
  await waitForTextInScroll(title, "jobs-scroll", 40000);
}

async function requestConnectionByUi(targetUserId) {
  await tapTab("connections");
  await scrollToTop("connections-scroll");
  await typeById("connections-target-user-id", targetUserId, "connections-scroll");
  await tapById("connections-request-submit", "connections-scroll");
  await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);
}

async function openOwnJobManagerByUi() {
  await tapTab("jobs");
  await scrollToTop("jobs-scroll");

  if (await isVisibleByText("Manage job/applicant", 800)) {
    await tapByTextInScroll("Manage job/applicant", "jobs-scroll", 20000);
    return;
  }

  await tapByTextInScroll("Manage applicants", "jobs-scroll", 30000);
}

module.exports = {
  assertElementNotExistsById,
  assertTextNotVisible,
  createJobByUi,
  loginByUi,
  logStep,
  makeUser,
  openOwnJobManagerByUi,
  readElementTextById,
  readProfileUserId,
  registerByUi,
  requestConnectionByUi,
  scrollToTop,
  seedUserAndLoginByUi,
  signOutIfVisible,
  sleep,
  tapById,
  tapByTextInScroll,
  tapTab,
  typeById,
  waitForAuthEntryPoint,
  waitForSuccessOrError,
  waitForText,
  waitForTextInScroll
};
