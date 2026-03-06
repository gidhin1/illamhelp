const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:4000/api/v1";
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const MEMBER_ID_PATTERN = /[a-z0-9._-]{3,40}/i;
const E2E_TIMEOUT_MS = Number(process.env.DETOX_TEST_TIMEOUT_MS ?? "480000");
const DETOX_POLL_INTERVAL_MS = Number(process.env.DETOX_POLL_INTERVAL_MS ?? "450");
const DETOX_VERIFY_TYPED_INPUT = /^(1|true)$/i.test(
  process.env.DETOX_VERIFY_TYPED_INPUT ?? "false"
);
const DETOX_TYPE_RETRIES = Number(process.env.DETOX_TYPE_RETRIES ?? "1");
const DETOX_SCROLL_STEP_PX = Number(process.env.DETOX_SCROLL_STEP_PX ?? "220");
const DETOX_VISIBLE_CHECK_TIMEOUT_MS = Number(process.env.DETOX_VISIBLE_CHECK_TIMEOUT_MS ?? "200");
const DETOX_IOS_PROMPT_CHECK_TIMEOUT_MS = Number(
  process.env.DETOX_IOS_PROMPT_CHECK_TIMEOUT_MS ?? "80"
);
const DETOX_HANDLE_IOS_PASSWORD_PROMPTS = !/^(0|false)$/i.test(
  process.env.DETOX_HANDLE_IOS_PASSWORD_PROMPTS ?? "true"
);

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

function normalizeListResponse(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const candidates = [
      payload.items,
      payload.data,
      payload.connections,
      payload.jobs,
      payload.requests,
      payload.grants
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
  }
  return [];
}

async function loginByApi(user) {
  return apiRequest("POST", "/auth/login", {
    username: user.username,
    password: user.password
  });
}

async function registerByApi(user) {
  return apiRequest("POST", "/auth/register", {
    username: user.username,
    email: user.email,
    password: user.password,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: "+919812345678"
  });
}

async function listConnectionsByApi(accessToken) {
  const payload = await apiRequest("GET", "/connections", undefined, accessToken);
  return normalizeListResponse(payload);
}

async function listJobsByApi(accessToken) {
  const payload = await apiRequest("GET", "/jobs", undefined, accessToken);
  return normalizeListResponse(payload);
}

async function listAccessRequestsByApi(accessToken) {
  const payload = await apiRequest("GET", "/consent/requests", undefined, accessToken);
  return normalizeListResponse(payload);
}

async function listGrantsByApi(accessToken) {
  const payload = await apiRequest("GET", "/consent/grants", undefined, accessToken);
  return normalizeListResponse(payload);
}

async function listNotificationsByApi(accessToken, unreadOnly = false) {
  const query = unreadOnly ? "?unreadOnly=true&limit=50" : "?limit=50";
  const payload = await apiRequest("GET", `/notifications${query}`, undefined, accessToken);
  if (payload && Array.isArray(payload.items)) {
    return payload.items;
  }
  return normalizeListResponse(payload);
}

async function getUnreadNotificationCountByApi(accessToken) {
  const payload = await apiRequest(
    "GET",
    "/notifications/unread-count",
    undefined,
    accessToken
  );
  return typeof payload.unreadCount === "number" ? payload.unreadCount : 0;
}

let dotEnvCache = null;

function loadDotEnv() {
  if (dotEnvCache) {
    return dotEnvCache;
  }

  const envPath = resolve(process.cwd(), ".env");
  try {
    const content = readFileSync(envPath, "utf8");
    const values = {};
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      const equalsIndex = line.indexOf("=");
      if (equalsIndex < 0) {
        continue;
      }
      const key = line.slice(0, equalsIndex).trim();
      if (!key) {
        continue;
      }
      values[key] = line
        .slice(equalsIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
    dotEnvCache = values;
    return values;
  } catch {
    dotEnvCache = {};
    return dotEnvCache;
  }
}

function readEnvValue(key) {
  const processValue = process.env[key];
  if (typeof processValue === "string" && processValue.trim().length > 0) {
    return processValue.trim();
  }
  const dotEnvValue = loadDotEnv()[key];
  if (typeof dotEnvValue === "string" && dotEnvValue.trim().length > 0) {
    return dotEnvValue.trim();
  }
  return undefined;
}

function readKeycloakAdminConfig() {
  const keycloakUrl = (readEnvValue("KEYCLOAK_URL") ?? "http://localhost:8080").replace(/\/$/, "");
  const keycloakRealm = readEnvValue("KEYCLOAK_REALM") ?? "illamhelp";
  const adminUsername = readEnvValue("KEYCLOAK_ADMIN");
  const adminPassword = readEnvValue("KEYCLOAK_ADMIN_PASSWORD");

  if (!adminUsername || !adminPassword) {
    throw new Error(
      "KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD are required for admin role assignment in Detox."
    );
  }

  return {
    keycloakUrl,
    keycloakRealm,
    adminUsername,
    adminPassword
  };
}

async function getKeycloakAdminToken() {
  const config = readKeycloakAdminConfig();
  const form = new URLSearchParams();
  form.set("grant_type", "password");
  form.set("client_id", "admin-cli");
  form.set("username", config.adminUsername);
  form.set("password", config.adminPassword);

  const response = await fetch(`${config.keycloakUrl}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString()
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

  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Failed to get Keycloak admin token (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  return {
    config,
    accessToken: payload.access_token
  };
}

async function ensureRealmRoleForUserByUsername(username, roleName) {
  const { config, accessToken } = await getKeycloakAdminToken();
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`
  };

  const usersResponse = await fetch(
    `${config.keycloakUrl}/admin/realms/${encodeURIComponent(config.keycloakRealm)}/users?username=${encodeURIComponent(username)}&exact=true`,
    {
      method: "GET",
      headers: authHeaders
    }
  );
  const usersPayload = await usersResponse.json();
  if (!usersResponse.ok || !Array.isArray(usersPayload)) {
    throw new Error(
      `Failed to lookup user '${username}' in Keycloak (${usersResponse.status}): ${JSON.stringify(usersPayload)}`
    );
  }
  const matchedUser = usersPayload.find((item) => item.username === username) ?? usersPayload[0];
  const keycloakUserId = matchedUser?.id;
  if (!keycloakUserId) {
    throw new Error(`Keycloak user '${username}' not found for role assignment.`);
  }

  const roleResponse = await fetch(
    `${config.keycloakUrl}/admin/realms/${encodeURIComponent(config.keycloakRealm)}/roles/${encodeURIComponent(roleName)}`,
    {
      method: "GET",
      headers: authHeaders
    }
  );
  const rolePayload = await roleResponse.json();
  if (!roleResponse.ok || !rolePayload?.id || !rolePayload?.name) {
    throw new Error(
      `Failed to lookup realm role '${roleName}' (${roleResponse.status}): ${JSON.stringify(rolePayload)}`
    );
  }

  const mappingsResponse = await fetch(
    `${config.keycloakUrl}/admin/realms/${encodeURIComponent(config.keycloakRealm)}/users/${encodeURIComponent(keycloakUserId)}/role-mappings/realm`,
    {
      method: "GET",
      headers: authHeaders
    }
  );
  const mappingsPayload = await mappingsResponse.json();
  if (!mappingsResponse.ok || !Array.isArray(mappingsPayload)) {
    throw new Error(
      `Failed to read role mappings for '${username}' (${mappingsResponse.status}): ${JSON.stringify(mappingsPayload)}`
    );
  }
  if (mappingsPayload.some((role) => role.name === roleName)) {
    return;
  }

  const assignResponse = await fetch(
    `${config.keycloakUrl}/admin/realms/${encodeURIComponent(config.keycloakRealm)}/users/${encodeURIComponent(keycloakUserId)}/role-mappings/realm`,
    {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify([
        {
          id: rolePayload.id,
          name: rolePayload.name,
          composite: Boolean(rolePayload.composite),
          clientRole: Boolean(rolePayload.clientRole),
          containerId: rolePayload.containerId ?? config.keycloakRealm
        }
      ])
    }
  );

  if (![200, 201, 204].includes(assignResponse.status)) {
    const assignPayload = await assignResponse.text();
    throw new Error(
      `Failed to assign role '${roleName}' to '${username}' (${assignResponse.status}): ${assignPayload}`
    );
  }
}

async function getMyVerificationByApi(accessToken) {
  return apiRequest("GET", "/profiles/me/verification", undefined, accessToken);
}

async function listVerificationsByApi(accessToken, status) {
  const query = new URLSearchParams();
  query.set("limit", "100");
  if (status) {
    query.set("status", status);
  }
  const payload = await apiRequest(
    "GET",
    `/admin/oversight/verifications?${query.toString()}`,
    undefined,
    accessToken
  );
  return normalizeListResponse(payload);
}

async function reviewVerificationByApi(requestId, accessToken, decision, notes) {
  return apiRequest(
    "POST",
    `/admin/oversight/verifications/${requestId}/review`,
    {
      decision,
      notes
    },
    accessToken
  );
}

async function applyToJobByApi(jobId, accessToken, message) {
  return apiRequest(
    "POST",
    `/jobs/${jobId}/apply`,
    {
      message
    },
    accessToken
  );
}

async function applyToJobRaw(jobId, accessToken, message) {
  const headers = {
    "content-type": "application/json",
    Authorization: `Bearer ${accessToken}`
  };
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/apply`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message })
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

  return { status: response.status, payload };
}

async function listJobApplicationsByApi(jobId, accessToken) {
  const payload = await apiRequest("GET", `/jobs/${jobId}/applications`, undefined, accessToken);
  return normalizeListResponse(payload);
}

async function acceptJobApplicationByApi(applicationId, accessToken) {
  return apiRequest("POST", `/jobs/applications/${applicationId}/accept`, undefined, accessToken);
}

async function startBookingByApi(jobId, accessToken) {
  return apiRequest("POST", `/jobs/${jobId}/booking/start`, undefined, accessToken);
}

async function completeBookingByApi(jobId, accessToken) {
  return apiRequest("POST", `/jobs/${jobId}/booking/complete`, undefined, accessToken);
}

async function markPaymentDoneByApi(jobId, accessToken) {
  return apiRequest("POST", `/jobs/${jobId}/booking/payment-done`, undefined, accessToken);
}

async function markPaymentReceivedByApi(jobId, accessToken) {
  return apiRequest("POST", `/jobs/${jobId}/booking/payment-received`, undefined, accessToken);
}

async function closeBookingByApi(jobId, accessToken) {
  return apiRequest("POST", `/jobs/${jobId}/booking/close`, undefined, accessToken);
}

async function requestConnectionByApi(accessToken, targetUserId) {
  return apiRequest(
    "POST",
    "/connections/request",
    {
      targetUserId
    },
    accessToken
  );
}

async function acceptConnectionByApi(accessToken, connectionId) {
  return apiRequest("POST", `/connections/${connectionId}/accept`, undefined, accessToken);
}

async function poll(action, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await action();
    if (value !== undefined && value !== null) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, DETOX_POLL_INTERVAL_MS));
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

async function isVisibleById(targetId, timeoutMs = DETOX_VISIBLE_CHECK_TIMEOUT_MS) {
  try {
    await waitFor(element(by.id(targetId))).toBeVisible().withTimeout(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

async function ensureVisible(targetId, scrollId) {
  if (!scrollId) {
    await waitFor(element(by.id(targetId))).toBeVisible().withTimeout(20000);
    return;
  }

  if (await isVisibleById(targetId)) {
    return;
  }

  await dismissKeyboardOverlay();
  await scrollToTop(scrollId);

  try {
    // Prime the scroll view once so we always perform an actual scroll gesture.
    await element(by.id(scrollId)).scroll(DETOX_SCROLL_STEP_PX, "down");
  } catch {
    // no-op
  }

  try {
    await waitFor(element(by.id(targetId)))
      .toBeVisible()
      .withTimeout(20000)
      .whileElement(by.id(scrollId))
      .scroll(DETOX_SCROLL_STEP_PX, "down");
    return;
  } catch (downError) {
    // Deterministic fallback for bottom-pinned actions like submit buttons.
    try {
      await element(by.id(scrollId)).scrollTo("bottom");
      if (await isVisibleById(targetId, 1500)) {
        return;
      }
    } catch {
      // no-op
    }
    throw downError;
  }
}

async function typeById(targetId, value, scrollId) {
  if (DETOX_HANDLE_IOS_PASSWORD_PROMPTS) {
    await dismissIosPasswordPromptIfPresent();
  }
  await dismissKeyboardOverlay();
  const expected = String(value);
  const attempts = Math.max(1, DETOX_TYPE_RETRIES);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await ensureVisible(targetId, scrollId);
    try {
      await element(by.id(targetId)).tap();
      await element(by.id(targetId)).replaceText(expected);

      if (!DETOX_VERIFY_TYPED_INPUT) {
        return;
      }

      const current = await readElementTextById(targetId);
      if (current === expected) {
        return;
      }
    } catch (error) {
      if (attempt >= attempts) {
        throw error;
      }
    }
  }

  const finalValue = await readElementTextById(targetId);
  throw new Error(`Failed to set input ${targetId}. Expected "${expected}", got "${finalValue}"`);
}

async function tapById(targetId, scrollId) {
  if (DETOX_HANDLE_IOS_PASSWORD_PROMPTS) {
    await dismissIosPasswordPromptIfPresent();
  }
  await dismissKeyboardOverlay();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await ensureVisible(targetId, scrollId);
    try {
      await dismissKeyboardOverlay();
      await element(by.id(targetId)).tap();
      return;
    } catch (error) {
      if (attempt >= 3) {
        throw error;
      }
    }
  }
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

  // Fast-path: avoid checking many text/label permutations on every field interaction.
  const alertVisible = await waitForAnyVisible(
    [by.type("XCUIElementTypeAlert"), by.type("_UIAlertControllerView")],
    DETOX_IOS_PROMPT_CHECK_TIMEOUT_MS
  );

  if (!alertVisible) {
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

  if (await tapFirstVisible(dismissButtonMatchers, 120)) {
    return true;
  }

  const fallbackMatchers = [
    by.type("_UIAlertControllerActionView").atIndex(0),
    by.type("XCUIElementTypeButton").atIndex(0)
  ];
  if (await tapFirstVisible(fallbackMatchers, 80)) {
    return true;
  }

  throw new Error("iOS password prompt detected but could not be dismissed.");
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
    await new Promise((resolve) => setTimeout(resolve, 80));
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
    "profile-scroll"
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

async function tapTab(tabKey) {
  const tabId = `tab-${tabKey}`;
  let lastError;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await settleIosPasswordPromptIfPresent();
      await dismissKeyboardOverlay();
      await settleIosPasswordPromptIfPresent();
      await tapById(tabId);
      await settleIosPasswordPromptIfPresent();
      return;
    } catch (error) {
      lastError = error;
      await settleIosPasswordPromptIfPresent();
      await new Promise((resolve) => setTimeout(resolve, 120));
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

async function waitForJobCreated(accessToken, jobTitle, timeoutMs) {
  return poll(async () => {
    const jobs = await listJobsByApi(accessToken);
    const found = jobs.find((job) => job.title === jobTitle);
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

async function submitJobAndWaitForCreate(accessToken, jobTitle, expectedJobSnapshot) {
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
      return await waitForJobCreated(accessToken, jobTitle, 15000);
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

async function waitForText(text, timeoutMs = 30000) {
  await waitFor(element(by.text(text))).toBeVisible().withTimeout(timeoutMs);
}

async function assertElementNotExistsById(targetId, timeoutMs = 1500) {
  try {
    await waitFor(element(by.id(targetId))).toExist().withTimeout(timeoutMs);
    throw new Error(`Element ${targetId} unexpectedly exists`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("unexpectedly exists")) {
      throw error;
    }
  }
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
    await tapById("app-signout");
    await dismissIosPasswordPromptIfPresent();
    await waitFor(element(by.id("auth-mode-login"))).toBeVisible().withTimeout(15000);
  } catch {
    // no-op when already signed out
  }
}

async function waitForAuthEntryPoint() {
  await dismissIosPasswordPromptIfPresent();
  try {
    await waitFor(element(by.id("auth-mode-register"))).toBeVisible().withTimeout(30000);
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
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await waitForAuthEntryPoint();
    await settleIosPasswordPromptIfPresent();
    await tapById("auth-mode-register", "auth-scroll");
    await typeById("auth-register-first-name", user.firstName, "auth-scroll");
    await typeById("auth-register-last-name", user.lastName, "auth-scroll");
    await typeById("auth-register-email", user.email, "auth-scroll");
    await typeById("auth-register-username", user.username, "auth-scroll");
    await typeById("auth-register-phone", "+919812345678", "auth-scroll");
    await typeById("auth-register-password", user.password, "auth-scroll");
    await tapById("auth-register-submit", "auth-scroll");
    try {
      await waitForHomeOrAuthError("register");
      await settleIosPasswordPromptIfPresent();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        attempt < 3 &&
        /too many authentication attempts|http 429|try again shortly/i.test(message)
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        continue;
      }
      throw error;
    }
  }
}

async function seedUserAndLoginByUi(user) {
  await signOutIfVisible();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await registerByApi(user);
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        attempt < 3 &&
        /too many authentication attempts|http 429|try again shortly/i.test(message)
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        continue;
      }
      throw error;
    }
  }
  await loginByUi(user);
}

async function loginByUi(user) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await waitForAuthEntryPoint();
    await settleIosPasswordPromptIfPresent();
    await tapById("auth-mode-login", "auth-scroll");
    await typeById("auth-login-username", user.username, "auth-scroll");
    await typeById("auth-login-password", user.password, "auth-scroll");
    await tapById("auth-login-submit", "auth-scroll");
    try {
      await waitForHomeOrAuthError("login");
      await settleIosPasswordPromptIfPresent();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        attempt < 3 &&
        /too many authentication attempts|http 429|try again shortly/i.test(message)
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        continue;
      }
      throw error;
    }
  }
}

async function readProfileUserId() {
  await dismissIosPasswordPromptIfPresent();
  await tapTab("profile");
  await waitFor(element(by.id("profile-user-id"))).toBeVisible().withTimeout(20000);
  const attrs = await element(by.id("profile-user-id")).getAttributes();
  const text = attrs.text ?? attrs.label ?? attrs.value ?? "";
  return parseMemberId(text, "profile user id");
}

describe("IllamHelp mobile full flow (Detox)", () => {
  it("auth entrypoint renders login and register modes", async () => {
    await waitForAuthEntryPoint();
    await waitFor(element(by.id("auth-mode-login"))).toBeVisible().withTimeout(15000);
    await waitFor(element(by.id("auth-mode-register"))).toBeVisible().withTimeout(15000);
  });

  it("auth mode switch shows expected form fields", async () => {
    await waitForAuthEntryPoint();
    await tapById("auth-mode-login", "auth-scroll");
    await waitFor(element(by.id("auth-login-username"))).toBeVisible().withTimeout(15000);
    await waitFor(element(by.id("auth-login-password"))).toBeVisible().withTimeout(15000);

    await tapById("auth-mode-register", "auth-scroll");
    await waitFor(element(by.id("auth-register-first-name"))).toBeVisible().withTimeout(15000);
    await waitFor(element(by.id("auth-register-email"))).toBeVisible().withTimeout(15000);
    await waitFor(element(by.id("auth-register-username"))).toBeVisible().withTimeout(15000);
  });

  it("register lands on home and sign out returns to auth", async () => {
    const user = makeUser("both");
    await registerByUi(user);
    await waitFor(element(by.id("tab-home"))).toBeVisible().withTimeout(20000);
    await signOutIfVisible();
    await waitForAuthEntryPoint();
  });

  it("login with wrong password shows auth error", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);
    await signOutIfVisible();
    await waitForAuthEntryPoint();
    await tapById("auth-mode-login", "auth-scroll");
    await typeById("auth-login-username", user.username, "auth-scroll");
    await typeById("auth-login-password", `${user.password}x`, "auth-scroll");
    await tapById("auth-login-submit", "auth-scroll");
    await waitFor(element(by.id("auth-error-banner"))).toBeVisible().withTimeout(20000);
  });

  it("tab navigation works after sign in", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);

    await tapTab("notifications");
    await waitForText("Stay updated");

    await tapTab("jobs");
    await waitForText("Post new work");

    await tapTab("connections");
    await waitForText("Connect with people you trust");

    await tapTab("consent");
    await waitForText("Share contact details safely");

    await tapTab("profile");
    await waitForText("Your account");

    await tapTab("home");
    await waitForText("Your activity at a glance");
  });

  it("notifications page shows empty state for a new user", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);

    await tapTab("notifications");
    await waitForText("Stay updated");
    await waitFor(element(by.id("notifications-empty"))).toBeVisible().withTimeout(20000);
    const unreadBadgeText = await readElementTextById("notifications-unread-count");
    if (!/^\d+\s+unread$/i.test(unreadBadgeText)) {
      throw new Error(`Unexpected unread badge text: ${unreadBadgeText}`);
    }
  });

  it("jobs form shows validation error for short payload", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);

    await tapTab("jobs");
    await scrollToTop("jobs-scroll");
    await typeById("jobs-category", "p", "jobs-scroll");
    await typeById("jobs-title", "abc", "jobs-scroll");
    await typeById("jobs-description", "short", "jobs-scroll");
    await typeById("jobs-location", "k", "jobs-scroll");
    await tapById("jobs-submit", "jobs-scroll");
    await waitFor(element(by.id("jobs-submit-error-banner"))).toBeVisible().withTimeout(20000);
  });

  it("jobs form creates a valid post", async () => {
    const user = makeUser("both");
    const shortId = Date.now().toString(36).slice(-4);
    const title = `Leak fix ${shortId}`;
    await seedUserAndLoginByUi(user);

    await tapTab("jobs");
    await scrollToTop("jobs-scroll");
    await typeById("jobs-category", "plumber", "jobs-scroll");
    await typeById("jobs-title", title, "jobs-scroll");
    await typeById(
      "jobs-description",
      "Need urgent sink leakage repair support in apartment kitchen.",
      "jobs-scroll"
    );
    await typeById("jobs-location", "Kakkanad, Kochi", "jobs-scroll");
    await tapById("jobs-submit", "jobs-scroll");
    await waitForSuccessOrError("jobs-success-banner", [
      "jobs-submit-error-banner",
      "jobs-error-banner"
    ]);
    await waitForText(title);
  });

  it("jobs posted by me shows no-applicants state and disables applicant management when empty", async () => {
    const user = makeUser("both");
    const shortId = Date.now().toString(36).slice(-4);
    const title = `Manage applicants ${shortId}`;
    await seedUserAndLoginByUi(user);
    const userId = await readProfileUserId();
    const apiSession = await loginByApi(user);

    await tapTab("jobs");
    await scrollToTop("jobs-scroll");
    await typeById("jobs-category", "plumber", "jobs-scroll");
    await typeById("jobs-title", title, "jobs-scroll");
    await typeById(
      "jobs-description",
      "Need plumbing support for bathroom leakage diagnostics.",
      "jobs-scroll"
    );
    await typeById("jobs-location", "Kakkanad, Kochi", "jobs-scroll");
    await tapById("jobs-submit", "jobs-scroll");
    await waitForSuccessOrError("jobs-success-banner", [
      "jobs-submit-error-banner",
      "jobs-error-banner"
    ]);

    const jobId = await poll(async () => {
      const jobs = await listJobsByApi(apiSession.accessToken);
      const found = jobs.find((item) => item.seekerUserId === userId && item.title === title);
      return found?.id;
    }, 30000);
    parseUuid(jobId, "jobs manage applicants job id");

    await waitFor(element(by.id(`jobs-no-applicants-${jobId}`)))
      .toBeVisible()
      .withTimeout(20000);
    const manageAttrs = await element(by.id(`jobs-manage-${jobId}`)).getAttributes();
    if (manageAttrs.enabled !== false) {
      throw new Error(`Expected jobs-manage-${jobId} to be disabled when no applicants.`);
    }
  });

  it("jobs posted by me opens applicant manager view when applicants exist", async () => {
    const seeker = makeUser("both");
    const provider = makeUser("both");
    const shortId = Date.now().toString(36).slice(-4);
    const title = `Applicant review ${shortId}`;

    await seedUserAndLoginByUi(seeker);
    const seekerUserId = await readProfileUserId();
    const seekerApiSession = await loginByApi(seeker);

    await tapTab("jobs");
    await scrollToTop("jobs-scroll");
    await typeById("jobs-category", "plumber", "jobs-scroll");
    await typeById("jobs-title", title, "jobs-scroll");
    await typeById(
      "jobs-description",
      "Need support for kitchen pipeline pressure issue.",
      "jobs-scroll"
    );
    await typeById("jobs-location", "Kakkanad, Kochi", "jobs-scroll");
    await tapById("jobs-submit", "jobs-scroll");
    await waitForSuccessOrError("jobs-success-banner", [
      "jobs-submit-error-banner",
      "jobs-error-banner"
    ]);

    const jobId = await poll(async () => {
      const jobs = await listJobsByApi(seekerApiSession.accessToken);
      const found = jobs.find((item) => item.seekerUserId === seekerUserId && item.title === title);
      return found?.id;
    }, 30000);
    parseUuid(jobId, "jobs applicant manager job id");

    await signOutIfVisible();
    await seedUserAndLoginByUi(provider);
    const providerUserId = await readProfileUserId();
    const providerApiSession = await loginByApi(provider);
    const applied = await applyToJobByApi(
      jobId,
      providerApiSession.accessToken,
      "Can inspect and complete this job today."
    );
    if (applied.status !== "applied") {
      throw new Error(`Expected application status 'applied', got ${applied.status}`);
    }

    await signOutIfVisible();
    await loginByUi(seeker);
    await tapTab("jobs");
    await scrollToTop("jobs-scroll");
    await waitFor(element(by.id(`jobs-manage-${jobId}`))).toBeVisible().withTimeout(30000);
    const manageAttrs = await element(by.id(`jobs-manage-${jobId}`)).getAttributes();
    if (manageAttrs.enabled === false) {
      throw new Error(`Expected jobs-manage-${jobId} to be enabled when applicants exist.`);
    }
    await tapById(`jobs-manage-${jobId}`, "jobs-scroll");
    await waitForText(`Manage job: ${title}`, 30000);
    await waitForText(providerUserId, 30000);
  });

  it("connections page shows empty state for new user", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);
    await tapTab("connections");
    await waitForText("No connections yet.");
  });

  it("consent page shows empty-state guidance for new user", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);
    await tapTab("consent");
    await waitForText("No accepted connections yet.");
    await waitForText("No pending requests for you.");
  });

  it("profile saves changes and uploads media proof", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);
    await tapTab("profile");
    await scrollToTop("profile-scroll");

    await typeById("profile-city", "Kochi", "profile-scroll");
    await typeById("profile-area", "Kakkanad", "profile-scroll");
    await typeById("profile-service-categories", "plumber,electrician", "profile-scroll");
    await typeById("profile-phone", "+919812345678", "profile-scroll");
    await tapById("profile-save", "profile-scroll");
    await waitForText("Profile updated.");

    await tapById("profile-media-upload", "profile-scroll");
    await waitFor(element(by.id("profile-media-success"))).toBeVisible().withTimeout(30000);
  });

  it("profile public gallery hides media that is still in review", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);
    const memberId = await readProfileUserId();

    await scrollToTop("profile-scroll");
    await tapById("profile-media-upload", "profile-scroll");
    await waitFor(element(by.id("profile-media-success"))).toBeVisible().withTimeout(30000);

    await typeById("profile-public-owner-input", memberId, "profile-scroll");
    await tapById("profile-public-load", "profile-scroll");
    await waitFor(element(by.id("profile-public-empty"))).toBeVisible().withTimeout(30000);
    await assertElementNotExistsById("profile-public-item");
  });

  it("profile public gallery shows error for unknown member id", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);
    await tapTab("profile");
    await scrollToTop("profile-scroll");

    await typeById(
      "profile-public-owner-input",
      `missing_${Date.now().toString(36).slice(-6)}`,
      "profile-scroll"
    );
    await tapById("profile-public-load", "profile-scroll");
    await waitFor(element(by.id("profile-public-media-error"))).toBeVisible().withTimeout(30000);
  });

  it("mobile E2E connection lifecycle: decline -> re-request -> accept -> block", async () => {
    const requester = makeUser("both");
    const owner = makeUser("both");

    await seedUserAndLoginByUi(requester);
    const requesterUserId = await readProfileUserId();
    const requesterApiSession = await loginByApi(requester);

    await signOutIfVisible();
    await seedUserAndLoginByUi(owner);
    const ownerUserId = await readProfileUserId();
    const ownerApiSession = await loginByApi(owner);

    await signOutIfVisible();
    await loginByUi(requester);
    await tapTab("connections");
    await scrollToTop("connections-scroll");
    await typeById("connections-target-user-id", ownerUserId, "connections-scroll");
    await tapById("connections-request-submit", "connections-scroll");
    await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);

    const firstConnectionId = await poll(async () => {
      const connections = await listConnectionsByApi(requesterApiSession.accessToken);
      const found = connections.find((item) => {
        const users = new Set([item.userAId, item.userBId]);
        return users.has(requesterUserId) && users.has(ownerUserId) && item.status === "pending";
      });
      return found?.id;
    }, 30000);

    await signOutIfVisible();
    await loginByUi(owner);
    await tapTab("connections");
    await scrollToTop("connections-scroll");
    await tapById(`connections-decline-${firstConnectionId}`, "connections-scroll");
    await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);

    await poll(async () => {
      const connections = await listConnectionsByApi(ownerApiSession.accessToken);
      const found = connections.find(
        (item) => item.id === firstConnectionId && item.status === "declined"
      );
      return found?.id;
    }, 30000);

    await signOutIfVisible();
    await loginByUi(requester);
    await tapTab("connections");
    await scrollToTop("connections-scroll");
    await typeById("connections-target-user-id", ownerUserId, "connections-scroll");
    await tapById("connections-request-submit", "connections-scroll");
    await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);

    const secondConnectionId = await poll(async () => {
      const connections = await listConnectionsByApi(requesterApiSession.accessToken);
      const found = connections.find((item) => {
        const users = new Set([item.userAId, item.userBId]);
        return (
          users.has(requesterUserId) &&
          users.has(ownerUserId) &&
          item.status === "pending" &&
          item.id !== firstConnectionId
        );
      });
      return found?.id;
    }, 30000);

    await signOutIfVisible();
    await loginByUi(owner);
    await tapTab("connections");
    await scrollToTop("connections-scroll");
    await tapById(`connections-accept-${secondConnectionId}`, "connections-scroll");
    await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);

    await poll(async () => {
      const connections = await listConnectionsByApi(ownerApiSession.accessToken);
      const found = connections.find(
        (item) => item.id === secondConnectionId && item.status === "accepted"
      );
      return found?.id;
    }, 30000);

    await tapById(`connections-block-${secondConnectionId}`, "connections-scroll");
    await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);

    await poll(async () => {
      const connections = await listConnectionsByApi(ownerApiSession.accessToken);
      const found = connections.find(
        (item) => item.id === secondConnectionId && item.status === "blocked"
      );
      return found?.id;
    }, 30000);
  });

  it("mobile alerts flow marks unread notifications as read", async () => {
    const owner = makeUser("both");
    const requester = makeUser("both");

    await seedUserAndLoginByUi(owner);
    const ownerUserId = await readProfileUserId();
    const ownerApiSession = await loginByApi(owner);

    await signOutIfVisible();
    await seedUserAndLoginByUi(requester);
    const requesterApiSession = await loginByApi(requester);
    await requestConnectionByApi(requesterApiSession.accessToken, ownerUserId);

    await poll(async () => {
      const unread = await getUnreadNotificationCountByApi(ownerApiSession.accessToken);
      return unread > 0 ? unread : undefined;
    }, 30000);

    await signOutIfVisible();
    await loginByUi(owner);
    await tapTab("notifications");
    await waitFor(element(by.id("notifications-mark-all"))).toBeVisible().withTimeout(30000);
    await tapById("notifications-mark-all", "notifications-scroll");

    await poll(async () => {
      const unread = await getUnreadNotificationCountByApi(ownerApiSession.accessToken);
      return unread === 0 ? unread : undefined;
    }, 30000);

    const unreadBadgeText = await readElementTextById("notifications-unread-count");
    if (!/^0\s+unread$/i.test(unreadBadgeText)) {
      throw new Error(`Expected unread badge to reset to 0 unread, got: ${unreadBadgeText}`);
    }

    const unreadNotifications = await listNotificationsByApi(
      ownerApiSession.accessToken,
      true
    );
    if (unreadNotifications.length !== 0) {
      throw new Error(
        `Expected no unread notifications after mark-all-read, got ${unreadNotifications.length}`
      );
    }
  });

  it("mobile E2E verification lifecycle: submit -> admin review -> user notification", async () => {
    const member = makeUser("both");
    const adminCandidate = makeUser("both");
    const shortId = Date.now().toString(36).slice(-4);
    const reviewNote = `Verification approved in Detox ${shortId}`;
    const documentMediaId = "11111111-1111-4111-8111-111111111111";

    await seedUserAndLoginByUi(member);
    const memberApiSession = await loginByApi(member);

    await tapTab("verification");
    await scrollToTop("verification-scroll");
    await typeById("verification-media-ids", documentMediaId, "verification-scroll");
    await typeById(
      "verification-notes",
      "Government ID submitted for verification lifecycle E2E.",
      "verification-scroll"
    );
    await tapById("verification-submit", "verification-scroll");
    await waitForSuccessOrError("verification-success-banner", ["verification-error-banner"]);

    const verificationRequestId = await poll(async () => {
      const verification = await getMyVerificationByApi(memberApiSession.accessToken);
      if (!verification || verification.status !== "pending") {
        return undefined;
      }
      return verification.id;
    }, 30000);
    parseUuid(verificationRequestId, "verification request id");

    await signOutIfVisible();
    await seedUserAndLoginByUi(adminCandidate);
    await signOutIfVisible();
    await ensureRealmRoleForUserByUsername(adminCandidate.username, "admin");

    await loginByUi(adminCandidate);
    const adminApiSession = await loginByApi(adminCandidate);

    await poll(async () => {
      const items = await listVerificationsByApi(adminApiSession.accessToken, "pending");
      const found = items.find((item) => item.id === verificationRequestId);
      return found?.id;
    }, 30000);

    const reviewed = await reviewVerificationByApi(
      verificationRequestId,
      adminApiSession.accessToken,
      "approved",
      reviewNote
    );
    if (reviewed.status !== "approved") {
      throw new Error(`Expected approved verification status, got ${reviewed.status}`);
    }

    await poll(async () => {
      const unreadNotifications = await listNotificationsByApi(memberApiSession.accessToken, true);
      return unreadNotifications.some(
        (item) => item.type === "verification_approved" && item.title.includes("Verification approved")
      )
        ? true
        : undefined;
    }, 30000);

    await signOutIfVisible();
    await loginByUi(member);
    await tapTab("notifications");
    await waitForText("Verification approved!", 30000);

    await tapTab("verification");
    await waitForText("Status: Approved ✅", 30000);
    await waitForText(reviewNote, 30000);
  });

  it("mobile E2E jobs visibility: connections_only blocks non-connections then allows accepted connection", async () => {
    const seeker = makeUser("both");
    const provider = makeUser("both");
    const shortId = Date.now().toString(36).slice(-4);
    const jobTitle = `Conn-only ${shortId}`;

    await seedUserAndLoginByUi(seeker);
    const seekerUserId = await readProfileUserId();
    const seekerApiSession = await loginByApi(seeker);

    await tapTab("jobs");
    await scrollToTop("jobs-scroll");
    await typeById("jobs-category", "plumber", "jobs-scroll");
    await typeById("jobs-title", jobTitle, "jobs-scroll");
    await typeById(
      "jobs-description",
      "Connections-only posting for visibility gate validation.",
      "jobs-scroll"
    );
    await typeById("jobs-location", "Kochi, Kakkanad", "jobs-scroll");
    await tapById("jobs-visibility-connections", "jobs-scroll");
    await tapById("jobs-submit", "jobs-scroll");
    await waitForSuccessOrError("jobs-success-banner", [
      "jobs-submit-error-banner",
      "jobs-error-banner"
    ]);
    await waitForText("Visibility: Connections only", 30000);

    const jobId = await poll(async () => {
      const jobs = await listJobsByApi(seekerApiSession.accessToken);
      const found = jobs.find((item) => item.seekerUserId === seekerUserId && item.title === jobTitle);
      return found?.id;
    }, 30000);
    parseUuid(jobId, "connections-only job id");

    await signOutIfVisible();
    await seedUserAndLoginByUi(provider);
    const providerApiSession = await loginByApi(provider);

    const deniedApply = await applyToJobRaw(
      jobId,
      providerApiSession.accessToken,
      "Can visit today."
    );
    const deniedPayload = JSON.stringify(deniedApply.payload).toLowerCase();
    if (deniedApply.status !== 400 || !deniedPayload.includes("connection")) {
      throw new Error(
        `Expected 400 connection-visibility denial. Got ${deniedApply.status}: ${JSON.stringify(
          deniedApply.payload
        )}`
      );
    }

    const requestedConnection = await requestConnectionByApi(
      providerApiSession.accessToken,
      seekerUserId
    );
    const acceptedConnection = await acceptConnectionByApi(
      seekerApiSession.accessToken,
      requestedConnection.id
    );
    if (acceptedConnection.status !== "accepted") {
      throw new Error(`Expected accepted connection, got ${acceptedConnection.status}`);
    }

    const applied = await applyToJobByApi(
      jobId,
      providerApiSession.accessToken,
      "Can visit today."
    );
    if (applied.status !== "applied") {
      throw new Error(`Expected applied status after accepted connection, got ${applied.status}`);
    }
  });

  it("mobile E2E booking lifecycle reaches closed state with payment milestones", async () => {
    const seeker = makeUser("seeker");
    const provider = makeUser("provider");
    const shortId = Date.now().toString(36).slice(-4);
    const jobTitle = `Book ${shortId}`;

    await seedUserAndLoginByUi(seeker);
    const seekerUserId = await readProfileUserId();
    const seekerApiSession = await loginByApi(seeker);
    await tapTab("jobs");
    await scrollToTop("jobs-scroll");
    await typeById("jobs-category", "electrician", "jobs-scroll");
    await typeById("jobs-title", jobTitle, "jobs-scroll");
    await typeById(
      "jobs-description",
      "Need electrician to inspect and fix frequent power trips.",
      "jobs-scroll"
    );
    await typeById("jobs-location", "Kakkanad, Kochi", "jobs-scroll");
    await tapById("jobs-submit", "jobs-scroll");
    await waitForSuccessOrError("jobs-success-banner", [
      "jobs-submit-error-banner",
      "jobs-error-banner"
    ]);

    const jobId = await poll(async () => {
      const jobs = await listJobsByApi(seekerApiSession.accessToken);
      const found = jobs.find(
        (item) => item.seekerUserId === seekerUserId && item.title === jobTitle
      );
      return found?.id;
    }, 30000);

    await signOutIfVisible();
    await seedUserAndLoginByUi(provider);
    const providerApiSession = await loginByApi(provider);

    const application = await applyToJobByApi(
      jobId,
      providerApiSession.accessToken,
      "Can inspect and complete this evening."
    );
    parseUuid(application.id, "booking application id");

    await poll(async () => {
      const applications = await listJobApplicationsByApi(jobId, seekerApiSession.accessToken);
      const found = applications.find((item) => item.id === application.id);
      return found?.id;
    }, 30000);

    const accepted = await acceptJobApplicationByApi(application.id, seekerApiSession.accessToken);
    if (accepted.status !== "accepted") {
      throw new Error(`Expected accepted application, got ${accepted.status}`);
    }

    const started = await startBookingByApi(jobId, providerApiSession.accessToken);
    if (started.status !== "in_progress") {
      throw new Error(`Expected in_progress job status, got ${started.status}`);
    }

    const completed = await completeBookingByApi(jobId, seekerApiSession.accessToken);
    if (completed.status !== "completed") {
      throw new Error(`Expected completed job status, got ${completed.status}`);
    }

    const paymentDone = await markPaymentDoneByApi(jobId, seekerApiSession.accessToken);
    if (paymentDone.status !== "payment_done") {
      throw new Error(`Expected payment_done job status, got ${paymentDone.status}`);
    }

    const paymentReceived = await markPaymentReceivedByApi(
      jobId,
      providerApiSession.accessToken
    );
    if (paymentReceived.status !== "payment_received") {
      throw new Error(`Expected payment_received job status, got ${paymentReceived.status}`);
    }

    const closed = await closeBookingByApi(jobId, seekerApiSession.accessToken);
    if (closed.status !== "closed") {
      throw new Error(`Expected closed job status, got ${closed.status}`);
    }

    await tapTab("jobs");
    await tapById("jobs-refresh", "jobs-scroll");
    await waitForText(jobTitle, 30000);
    await waitForText("closed", 30000);
  });

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
    await tapById(`consent-request-owner-${seekerUserId}`, "consent-scroll");
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
    await tapById(`consent-grant-request-${requestId}`, "consent-scroll");
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
    await tapById(`consent-can-view-owner-${seekerUserId}`, "consent-scroll");
    await tapById("consent-can-view-submit", "consent-scroll");
    await waitForSuccessOrError("consent-can-view-allowed-banner", ["consent-error-banner"]);

    logStep("seeker revokes grant");
    await signOutIfVisible();
    await loginByUi(seeker);
    await tapTab("consent");
    await scrollToTop("consent-scroll");
    await tapById(`consent-revoke-grant-${grantId}`, "consent-scroll");
    await typeById("consent-revoke-reason", "E2E revoke", "consent-scroll");
    await tapById("consent-revoke-submit", "consent-scroll");
    await waitForSuccessOrError("consent-success-banner", ["consent-error-banner"]);

    logStep("provider verifies access denied");
    await signOutIfVisible();
    await loginByUi(provider);
    await tapTab("consent");
    await scrollToTop("consent-scroll");
    await tapById(`consent-can-view-owner-${seekerUserId}`, "consent-scroll");
    await tapById("consent-can-view-submit", "consent-scroll");
    await waitForSuccessOrError("consent-can-view-denied-banner", ["consent-error-banner"]);

    parseUuid(connectionId, "connection id");
    parseUuid(requestId, "request id");
    parseUuid(grantId, "grant id");
    logStep("full flow complete");
  }, E2E_TIMEOUT_MS);
});
