const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:4000/api/v1";
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const E2E_TIMEOUT_MS = Number(process.env.DETOX_TEST_TIMEOUT_MS ?? "480000");

function logStep(message) {
  // Keep logs concise; these markers make timeout root-cause visible in CI/local output.
  console.log(`[e2e][mobile] ${message}`);
}

function parseUuid(value, context) {
  const match = String(value).match(UUID_PATTERN);
  if (!match) {
    throw new Error(`Unable to parse UUID for ${context}. Value: ${value}`);
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

async function apiRequest(method, path, body, accessToken) {
  const headers = {
    "content-type": "application/json"
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const raw = await response.text();
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw };
    }
  }

  if (!response.ok) {
    throw new Error(
      `API ${method} ${path} failed (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  return payload;
}

async function loginByApi(user) {
  return apiRequest("POST", "/auth/login", {
    username: user.username,
    password: user.password
  });
}

async function listConnectionsByApi(accessToken) {
  return apiRequest("GET", "/connections", undefined, accessToken);
}

async function listJobsByApi(accessToken) {
  return apiRequest("GET", "/jobs", undefined, accessToken);
}

async function listAccessRequestsByApi(accessToken) {
  return apiRequest("GET", "/consent/requests", undefined, accessToken);
}

async function listGrantsByApi(accessToken) {
  return apiRequest("GET", "/consent/grants", undefined, accessToken);
}

async function poll(action, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await action();
    if (value !== undefined && value !== null) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  throw new Error("Timed out while polling backend state.");
}

async function scrollToTop(scrollId) {
  try {
    await element(by.id(scrollId)).scrollTo("top");
  } catch {
    // no-op: some layouts may already be at top and throw.
  }
}

async function ensureVisible(targetId, scrollId) {
  if (scrollId) {
    try {
      await waitFor(element(by.id(targetId)))
        .toBeVisible()
        .whileElement(by.id(scrollId))
        .scroll(180, "down");
      return;
    } catch {
      // fallback below
    }
  }
  await waitFor(element(by.id(targetId))).toBeVisible().withTimeout(45000);
}

async function typeById(targetId, value, scrollId) {
  await dismissIosPasswordPromptIfPresent();
  await ensureVisible(targetId, scrollId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await element(by.id(targetId)).tap();
    await element(by.id(targetId)).replaceText(value);

    try {
      const current = await readElementTextById(targetId);
      if (current === value) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return;
      }
    } catch {
      // no-op, retry below
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const finalValue = await readElementTextById(targetId);
  throw new Error(`Failed to set input ${targetId}. Expected "${value}", got "${finalValue}"`);
}

async function tapById(targetId, scrollId) {
  await dismissIosPasswordPromptIfPresent();
  await ensureVisible(targetId, scrollId);
  await element(by.id(targetId)).tap();
}

async function waitForAnyVisible(matchers, timeoutMs) {
  for (const matcher of matchers) {
    try {
      await waitFor(element(matcher)).toBeVisible().withTimeout(timeoutMs);
      return true;
    } catch {
      // no-op
    }
  }
  return false;
}

async function tapFirstVisible(matchers, waitTimeoutMs = 180) {
  for (const matcher of matchers) {
    try {
      await waitFor(element(matcher)).toBeVisible().withTimeout(waitTimeoutMs);
      await element(matcher).tap();
      return true;
    } catch {
      // no-op
    }
  }
  return false;
}

async function dismissIosPasswordPromptIfPresent() {
  if (device.getPlatform() !== "ios") {
    return false;
  }

  const promptMatchers = [
    by.text("Save Password?"),
    by.label("Save Password?"),
    by.text("Save Password"),
    by.label("Save Password"),
    by.text("Use Strong Password?"),
    by.label("Use Strong Password?"),
    by.text("Use Strong Password"),
    by.label("Use Strong Password")
  ];
  const promptVisible = await waitForAnyVisible(promptMatchers, 180);

  if (!promptVisible) {
    return false;
  }

  const dismissButtonMatchers = [
    by.text("Not Now"),
    by.label("Not Now"),
    by.text("Not now"),
    by.label("Not now"),
    by.text("Don’t Save"),
    by.label("Don’t Save"),
    by.text("Don't Save"),
    by.label("Don't Save"),
    by.text("Close"),
    by.label("Close"),
    by.text("Cancel"),
    by.label("Cancel")
  ];

  if (await tapFirstVisible(dismissButtonMatchers, 220)) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return true;
  }

  const fallbackMatchers = [
    by.type("_UIAlertControllerActionView").atIndex(0),
    by.type("XCUIElementTypeButton").atIndex(0)
  ];
  if (await tapFirstVisible(fallbackMatchers, 120)) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return true;
  }

  const stillVisible = await waitForAnyVisible(promptMatchers, 300);
  if (stillVisible) {
    throw new Error("iOS password prompt was detected but could not be dismissed.");
  }

  return false;
}

async function settleIosPasswordPromptIfPresent() {
  if (device.getPlatform() !== "ios") {
    return;
  }

  let sawPrompt = false;
  let clearRounds = 0;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const dismissed = await dismissIosPasswordPromptIfPresent();
    if (dismissed) {
      sawPrompt = true;
      clearRounds = 0;
    } else if (sawPrompt) {
      clearRounds += 1;
      if (clearRounds >= 2) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

async function dismissKeyboardOverlay() {
  const surfaces = [
    "auth-scroll",
    "home-scroll",
    "jobs-scroll",
    "connections-scroll",
    "consent-scroll",
    "profile-scroll"
  ];

  for (const surfaceId of surfaces) {
    try {
      await element(by.id(surfaceId)).tap({ x: 6, y: 6 });
      await new Promise((resolve) => setTimeout(resolve, 120));
      return;
    } catch {
      // no-op
    }
  }
}

async function tapTab(tabKey) {
  const tabId = `tab-${tabKey}`;
  let lastError;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await settleIosPasswordPromptIfPresent();
      await dismissKeyboardOverlay();
      await settleIosPasswordPromptIfPresent();
      await waitFor(element(by.id(tabId))).toBeVisible().withTimeout(10000);
      await element(by.id(tabId)).tap();
      await settleIosPasswordPromptIfPresent();
      return;
    } catch (error) {
      lastError = error;
      await settleIosPasswordPromptIfPresent();
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
  }

  throw lastError ?? new Error(`Unable to tap ${tabId}`);
}

async function waitForSuccessOrError(successBannerId, errorBannerIds = [], timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  const allErrorBannerIds = ["auth-error-banner", ...errorBannerIds];

  while (Date.now() < deadline) {
    await dismissIosPasswordPromptIfPresent();

    try {
      await waitFor(element(by.id(successBannerId))).toExist().withTimeout(450);
      return;
    } catch {
      // no-op
    }

    for (const errorBannerId of allErrorBannerIds) {
      try {
        await waitFor(element(by.id(errorBannerId))).toExist().withTimeout(250);
        const errorMessage = await readElementTextById(errorBannerId);
        throw new Error(`Action failed (${errorBannerId}): ${errorMessage}`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Action failed")) {
          throw error;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Timed out waiting for success banner "${successBannerId}". Checked errors: ${allErrorBannerIds.join(", ")}`
  );
}

async function readFirstBannerMessage(bannerIds) {
  await dismissIosPasswordPromptIfPresent();
  for (const bannerId of bannerIds) {
    try {
      await waitFor(element(by.id(bannerId))).toExist().withTimeout(200);
      const text = await readElementTextById(bannerId);
      return `${bannerId}: ${text}`;
    } catch {
      // no-op
    }
  }
  return "";
}

async function waitForJobCreated(accessToken, seekerUserId, jobTitle, timeoutMs) {
  return poll(async () => {
    const jobs = await listJobsByApi(accessToken);
    const found = jobs.find(
      (job) => job.title === jobTitle && (job.seekerUserId === seekerUserId || !job.seekerUserId)
    );
    return found?.id;
  }, timeoutMs);
}

async function readJobFormSnapshot() {
  return {
    category: (await readElementTextById("jobs-category")).trim(),
    title: (await readElementTextById("jobs-title")).trim(),
    description: (await readElementTextById("jobs-description")).trim(),
    locationText: (await readElementTextById("jobs-location")).trim()
  };
}

function validateJobFormSnapshot(snapshot) {
  const errors = [];
  if (snapshot.category.length < 2) {
    errors.push("category must be >= 2 chars");
  }
  if (snapshot.title.length < 4) {
    errors.push("title must be >= 4 chars");
  }
  if (snapshot.description.length < 10) {
    errors.push("description must be >= 10 chars");
  }
  if (snapshot.locationText.length < 2) {
    errors.push("locationText must be >= 2 chars");
  }
  return errors;
}

function compareExpectedJobSnapshot(actual, expected) {
  const mismatches = [];
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = String(actual[key] ?? "").trim();
    if (actualValue !== String(expectedValue).trim()) {
      mismatches.push(`${key}: expected "${expectedValue}", got "${actualValue}"`);
    }
  }
  return mismatches;
}

async function submitJobAndWaitForCreate(accessToken, seekerUserId, jobTitle, expectedJobSnapshot) {
  const errorBanners = ["jobs-submit-error-banner", "jobs-error-banner", "auth-error-banner"];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const beforeSubmit = await readJobFormSnapshot();
    const inputValidationErrors = validateJobFormSnapshot(beforeSubmit);
    if (inputValidationErrors.length > 0) {
      throw new Error(
        `Jobs form invalid before submit: ${inputValidationErrors.join(", ")}. Snapshot: ${JSON.stringify(beforeSubmit)}`
      );
    }

    const mismatches = compareExpectedJobSnapshot(beforeSubmit, expectedJobSnapshot);
    if (mismatches.length > 0) {
      throw new Error(
        `Jobs form values differ from expected test data before submit: ${mismatches.join(" | ")}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
    await tapById("jobs-submit", "jobs-scroll");

    const immediateBanner = await readFirstBannerMessage(errorBanners);
    if (immediateBanner) {
      const snapshot = await readJobFormSnapshot();
      throw new Error(
        `Job create failed after clicking Post job (attempt ${attempt}). ${immediateBanner}. Snapshot: ${JSON.stringify(snapshot)}`
      );
    }

    try {
      return await waitForJobCreated(accessToken, seekerUserId, jobTitle, 15000);
    } catch (pollError) {
      const errorBanner = await readFirstBannerMessage(errorBanners);
      if (errorBanner) {
        const snapshot = await readJobFormSnapshot();
        throw new Error(
          `Job create failed after clicking Post job (attempt ${attempt}). ${errorBanner}. Snapshot: ${JSON.stringify(snapshot)}`
        );
      }

      if (attempt === 3) {
        const detail = pollError instanceof Error ? pollError.message : String(pollError);
        const snapshot = await readJobFormSnapshot();
        throw new Error(
          `Post job button was tapped 3 times (jobs-submit), but no job was created and no error banner appeared. ${detail}. Snapshot: ${JSON.stringify(snapshot)}`
        );
      }
    }
  }

  throw new Error("Unexpected submit loop termination for jobs-submit.");
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

async function waitForHomeOrAuthError(actionName) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    await dismissIosPasswordPromptIfPresent();

    try {
      await waitFor(element(by.id("tab-home"))).toBeVisible().withTimeout(1200);
      return;
    } catch {
      // no-op
    }

    try {
      await waitFor(element(by.id("auth-error-banner"))).toBeVisible().withTimeout(400);
      const message = await readElementTextById("auth-error-banner");
      throw new Error(`Auth ${actionName} failed: ${message}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Auth ")) {
        throw error;
      }
      // no-op
    }
  }

  throw new Error(
    `Auth ${actionName} timed out: tab-home never appeared and no auth-error-banner was visible.`
  );
}

async function signOutIfVisible() {
  await dismissIosPasswordPromptIfPresent();
  try {
    await waitFor(element(by.id("app-signout"))).toBeVisible().withTimeout(3000);
    await element(by.id("app-signout")).tap();
    await dismissIosPasswordPromptIfPresent();
    await waitFor(element(by.id("auth-mode-login"))).toBeVisible().withTimeout(15000);
  } catch {
    // no-op when already signed out
  }
}

async function waitForAuthEntryPoint() {
  await dismissIosPasswordPromptIfPresent();
  try {
    await waitFor(element(by.id("auth-mode-register"))).toBeVisible().withTimeout(60000);
    return;
  } catch {
    // fallback below
  }

  try {
    await waitFor(element(by.id("auth-mode-login"))).toBeVisible().withTimeout(10000);
    return;
  } catch {
    // fallback below
  }

  try {
    await waitFor(element(by.id("tab-home"))).toBeVisible().withTimeout(10000);
    await signOutIfVisible();
    await waitFor(element(by.id("auth-mode-register"))).toBeVisible().withTimeout(20000);
    return;
  } catch {
    // no-op; throw explicit guidance next
  }

  throw new Error(
    "Auth entrypoint did not appear. App may not have loaded UI yet. Check mobile/artifacts/detox/android-app.log and android-anr.log."
  );
}

async function registerByUi(user) {
  await waitForAuthEntryPoint();
  await settleIosPasswordPromptIfPresent();
  await ensureVisible("auth-mode-register", "auth-scroll");
  await element(by.id("auth-mode-register")).tap();
  await typeById("auth-register-first-name", user.firstName, "auth-scroll");
  await typeById("auth-register-last-name", user.lastName, "auth-scroll");
  await typeById("auth-register-email", user.email, "auth-scroll");
  await typeById("auth-register-username", user.username, "auth-scroll");
  await typeById("auth-register-phone", "+919812345678", "auth-scroll");
  await typeById("auth-register-password", user.password, "auth-scroll");
  await tapById("auth-register-submit", "auth-scroll");
  await waitForHomeOrAuthError("register");
  await settleIosPasswordPromptIfPresent();
}

async function loginByUi(user) {
  await waitForAuthEntryPoint();
  await settleIosPasswordPromptIfPresent();
  await ensureVisible("auth-mode-login", "auth-scroll");
  await element(by.id("auth-mode-login")).tap();
  await typeById("auth-login-username", user.username, "auth-scroll");
  await typeById("auth-login-password", user.password, "auth-scroll");
  await tapById("auth-login-submit", "auth-scroll");
  await waitForHomeOrAuthError("login");
  await settleIosPasswordPromptIfPresent();
}

async function readProfileUserId() {
  await dismissIosPasswordPromptIfPresent();
  await tapTab("profile");
  await waitFor(element(by.id("profile-user-id"))).toBeVisible().withTimeout(20000);
  const attrs = await element(by.id("profile-user-id")).getAttributes();
  const text = attrs.text ?? attrs.label ?? attrs.value ?? "";
  return parseUuid(text, "profile user id");
}

describe("IllamHelp mobile full flow (Detox)", () => {
  it("auth -> jobs -> connections -> consent", async () => {
    const seeker = makeUser("seeker");
    const provider = makeUser("provider");
    const shortId = Date.now().toString(36).slice(-4);
    const requestPurpose = `Req ${shortId}`;
    const grantPurpose = `Gr ${shortId}`;
    const jobCategory = "plumber";
    const jobTitle = `Kitchen sink leakage repair ${shortId}`;
    const jobDescription = "Need urgent service support for kitchen sink leakage in apartment.";
    const jobLocation = "Kakkanad, Kochi";

    logStep("register seeker");
    await registerByUi(seeker);
    logStep("read seeker profile");
    const seekerUserId = await readProfileUserId();
    const seekerApiSession = await loginByApi(seeker);

    logStep("create seeker job");
    await tapTab("jobs");
    await scrollToTop("jobs-scroll");
    await typeById("jobs-category", jobCategory, "jobs-scroll");
    await typeById("jobs-title", jobTitle, "jobs-scroll");
    await typeById("jobs-description", jobDescription, "jobs-scroll");
    await typeById("jobs-location", jobLocation, "jobs-scroll");
    const expectedJobSnapshot = {
      category: jobCategory,
      title: jobTitle,
      description: jobDescription,
      locationText: jobLocation
    };
    const createdJobId = await submitJobAndWaitForCreate(
      seekerApiSession.accessToken,
      seekerUserId,
      jobTitle,
      expectedJobSnapshot
    );
    parseUuid(createdJobId, "created job id");

    logStep("register provider");
    await signOutIfVisible();
    await registerByUi(provider);
    logStep("read provider profile");
    const providerUserId = await readProfileUserId();

    logStep("provider sends connection request");
    await tapTab("connections");
    await scrollToTop("connections-scroll");
    await typeById("connections-target-user-id", seekerUserId, "connections-scroll");
    await tapById("connections-request-submit", "connections-scroll");
    await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);

    const providerApiSession = await loginByApi(provider);
    logStep("poll for connection creation");
    const connectionId = await poll(async () => {
      const connections = await listConnectionsByApi(providerApiSession.accessToken);
      const found = connections.find((item) => {
        const users = new Set([item.userAId, item.userBId]);
        return users.has(seekerUserId) && users.has(providerUserId);
      });
      return found?.id;
    });

    logStep("seeker accepts connection");
    await signOutIfVisible();
    await loginByUi(seeker);
    await tapTab("connections");
    await scrollToTop("connections-scroll");
    await tapById(`connections-accept-${connectionId}`, "connections-scroll");
    await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);

    logStep("provider creates consent access request");
    await signOutIfVisible();
    await loginByUi(provider);
    await tapTab("consent");
    await scrollToTop("consent-scroll");
    await typeById("consent-request-owner-id", seekerUserId, "consent-scroll");
    await typeById("consent-request-connection-id", connectionId, "consent-scroll");
    await typeById("consent-request-purpose", requestPurpose, "consent-scroll");
    await tapById("consent-request-submit", "consent-scroll");
    await waitForSuccessOrError("consent-success-banner", ["consent-error-banner"]);

    logStep("poll for request id");
    const requestId = await poll(async () => {
      const requests = await listAccessRequestsByApi(providerApiSession.accessToken);
      const found = requests.find(
        (item) => item.ownerUserId === seekerUserId && item.purpose === requestPurpose
      );
      return found?.id;
    });

    logStep("seeker grants consent");
    await signOutIfVisible();
    await loginByUi(seeker);
    await tapTab("consent");
    await scrollToTop("consent-scroll");
    await typeById("consent-grant-request-id", requestId, "consent-scroll");
    await typeById("consent-grant-purpose", grantPurpose, "consent-scroll");
    await tapById("consent-grant-submit", "consent-scroll");
    await waitForSuccessOrError("consent-success-banner", ["consent-error-banner"]);

    logStep("poll for grant id");
    const grantId = await poll(async () => {
      const grants = await listGrantsByApi(seekerApiSession.accessToken);
      const found = grants.find(
        (item) => item.granteeUserId === providerUserId && item.purpose === grantPurpose
      );
      return found?.id;
    });

    logStep("provider verifies access allowed");
    await signOutIfVisible();
    await loginByUi(provider);
    await tapTab("consent");
    await scrollToTop("consent-scroll");
    await typeById("consent-can-view-owner-id", seekerUserId, "consent-scroll");
    await tapById("consent-can-view-submit", "consent-scroll");
    await waitForSuccessOrError("consent-can-view-allowed-banner", ["consent-error-banner"]);

    logStep("seeker revokes grant");
    await signOutIfVisible();
    await loginByUi(seeker);
    await tapTab("consent");
    await scrollToTop("consent-scroll");
    await typeById("consent-revoke-grant-id", grantId, "consent-scroll");
    await typeById("consent-revoke-reason", "E2E revoke", "consent-scroll");
    await tapById("consent-revoke-submit", "consent-scroll");
    await waitForSuccessOrError("consent-success-banner", ["consent-error-banner"]);

    logStep("provider verifies access denied");
    await signOutIfVisible();
    await loginByUi(provider);
    await tapTab("consent");
    await scrollToTop("consent-scroll");
    await typeById("consent-can-view-owner-id", seekerUserId, "consent-scroll");
    await tapById("consent-can-view-submit", "consent-scroll");
    await waitForSuccessOrError("consent-can-view-denied-banner", ["consent-error-banner"]);

    parseUuid(connectionId, "connection id");
    parseUuid(requestId, "request id");
    parseUuid(grantId, "grant id");
    logStep("full flow complete");
  }, E2E_TIMEOUT_MS);
});
