import { expect, APIRequestContext, Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  cardByHeading,
  E2eUser,
  makeUser,
  parseMemberId,
  parseUuid,
  readTextByTestId,
  waitForSuccessMessage
} from "../utils/flow-helpers";

const apiBaseUrl = process.env.PW_API_BASE_URL ?? "http://localhost:4010/api/v1";
const adminBaseUrl = process.env.PW_ADMIN_BASE_URL ?? "http://localhost:3103";

type AuthSessionResponse = {
  userId: string;
  accessToken: string;
};

type AuthMeResponse = {
  userId: string;
  roles: string[];
};

type ConnectionRecord = {
  id: string;
  userAId: string;
  userBId: string;
  requestedByUserId?: string;
  status: string;
};

type AccessRequestRecord = {
  id: string;
  ownerUserId: string;
  purpose: string;
  status: string;
};

type ConsentGrantRecord = {
  id: string;
  granteeUserId: string;
  purpose: string;
  status: string;
};

type ViewerProfileRecord = {
  userId: string;
  contact: {
    phone: string | null;
  };
  visibility: {
    phone: boolean;
  };
};

type JobApiRecord = {
  id: string;
  seekerUserId: string;
  title: string;
  visibility: "public" | "connections_only";
  status:
    | "posted"
    | "accepted"
    | "in_progress"
    | "completed"
    | "payment_done"
    | "payment_received"
    | "closed"
    | "cancelled";
  assignedProviderUserId: string | null;
  acceptedApplicationId: string | null;
};

type JobApplicationApiRecord = {
  id: string;
  jobId: string;
  providerUserId: string;
  status: "applied" | "shortlisted" | "accepted" | "rejected" | "withdrawn";
};

type VerificationApiRecord = {
  id: string;
  userId: string;
  documentMediaIds: string[];
  documentType: string;
  notes: string | null;
  status: "pending" | "under_review" | "approved" | "rejected";
  reviewerUserId: string | null;
  reviewerNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type NotificationApiRecord = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
};

type KeycloakAdminConfig = {
  keycloakUrl: string;
  keycloakRealm: string;
  adminUsername: string;
  adminPassword: string;
};

let dotEnvCache: Record<string, string> | null = null;

function loadDotEnv(): Record<string, string> {
  if (dotEnvCache) {
    return dotEnvCache;
  }

  const envPath = resolve(process.cwd(), ".env");
  try {
    const content = readFileSync(envPath, "utf8");
    const result: Record<string, string> = {};
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
      const value = line
        .slice(equalsIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      result[key] = value;
    }
    dotEnvCache = result;
    return result;
  } catch {
    dotEnvCache = {};
    return dotEnvCache;
  }
}

function readEnvValue(key: string): string | undefined {
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

function readKeycloakAdminConfig(): KeycloakAdminConfig {
  const keycloakUrl = readEnvValue("KEYCLOAK_URL") ?? "http://localhost:8080";
  const keycloakRealm = readEnvValue("KEYCLOAK_REALM") ?? "illamhelp";
  const adminUsername = readEnvValue("KEYCLOAK_ADMIN");
  const adminPassword = readEnvValue("KEYCLOAK_ADMIN_PASSWORD");

  if (!adminUsername || !adminPassword) {
    throw new Error(
      "KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD are required for admin E2E role assignment."
    );
  }

  return {
    keycloakUrl: keycloakUrl.replace(/\/$/, ""),
    keycloakRealm,
    adminUsername,
    adminPassword
  };
}

async function readErrorPayload(response: import("@playwright/test").APIResponse): Promise<string> {
  try {
    const body = await response.text();
    return body || "<empty response>";
  } catch {
    return "<unable to read response body>";
  }
}

function normalizeListResponse<T>(
  payload:
    | T[]
    | {
      items?: T[] | unknown;
      data?: T[] | unknown;
      connections?: T[] | unknown;
      jobs?: T[] | unknown;
      requests?: T[] | unknown;
      grants?: T[] | unknown;
      total?: number;
      limit?: number;
      offset?: number;
    }
): T[] {
  if (Array.isArray(payload)) {
    return payload;
  }
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
      return candidate as T[];
    }
  }
  return [];
}

async function loginByApi(request: APIRequestContext, user: E2eUser): Promise<AuthSessionResponse> {
  const response = await request.post(`${apiBaseUrl}/auth/login`, {
    data: {
      username: user.username,
      password: user.password
    }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as AuthSessionResponse;
}

async function authMeByApi(
  request: APIRequestContext,
  accessToken: string
): Promise<AuthMeResponse> {
  const response = await request.get(`${apiBaseUrl}/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as AuthMeResponse;
}

async function listConnectionsByApi(
  request: APIRequestContext,
  accessToken: string
): Promise<ConnectionRecord[]> {
  const response = await request.get(`${apiBaseUrl}/connections`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as
    | ConnectionRecord[]
    | { items?: ConnectionRecord[]; total?: number; limit?: number; offset?: number };
  return normalizeListResponse(payload);
}

async function listAccessRequestsByApi(
  request: APIRequestContext,
  accessToken: string
): Promise<AccessRequestRecord[]> {
  const response = await request.get(`${apiBaseUrl}/consent/requests`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as
    | AccessRequestRecord[]
    | { items?: AccessRequestRecord[]; total?: number; limit?: number; offset?: number };
  return normalizeListResponse(payload);
}

async function listGrantsByApi(
  request: APIRequestContext,
  accessToken: string
): Promise<ConsentGrantRecord[]> {
  const response = await request.get(`${apiBaseUrl}/consent/grants`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as
    | ConsentGrantRecord[]
    | { items?: ConsentGrantRecord[]; total?: number; limit?: number; offset?: number };
  return normalizeListResponse(payload);
}

async function getProfileByApi(
  request: APIRequestContext,
  targetUserId: string,
  accessToken: string
): Promise<ViewerProfileRecord> {
  const response = await request.get(`${apiBaseUrl}/profiles/${targetUserId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ViewerProfileRecord;
}

async function listJobsByApi(
  request: APIRequestContext,
  accessToken: string
): Promise<JobApiRecord[]> {
  const response = await request.get(`${apiBaseUrl}/jobs`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as
    | JobApiRecord[]
    | { items?: JobApiRecord[]; total?: number; limit?: number; offset?: number };
  return normalizeListResponse(payload);
}

async function applyToJobByApi(
  request: APIRequestContext,
  jobId: string,
  accessToken: string,
  message: string
): Promise<JobApplicationApiRecord> {
  const response = await request.post(`${apiBaseUrl}/jobs/${jobId}/apply`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    data: {
      message
    }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as JobApplicationApiRecord;
}

async function listJobApplicationsByApi(
  request: APIRequestContext,
  jobId: string,
  accessToken: string
): Promise<JobApplicationApiRecord[]> {
  const response = await request.get(`${apiBaseUrl}/jobs/${jobId}/applications`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as
    | JobApplicationApiRecord[]
    | { items?: JobApplicationApiRecord[]; total?: number; limit?: number; offset?: number };
  return normalizeListResponse(payload);
}

async function acceptJobApplicationByApi(
  request: APIRequestContext,
  applicationId: string,
  accessToken: string
): Promise<JobApplicationApiRecord> {
  const response = await request.post(
    `${apiBaseUrl}/jobs/applications/${applicationId}/accept`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as JobApplicationApiRecord;
}

async function startBookingByApi(
  request: APIRequestContext,
  jobId: string,
  accessToken: string
): Promise<JobApiRecord> {
  const response = await request.post(`${apiBaseUrl}/jobs/${jobId}/booking/start`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as JobApiRecord;
}

async function completeBookingByApi(
  request: APIRequestContext,
  jobId: string,
  accessToken: string
): Promise<JobApiRecord> {
  const response = await request.post(`${apiBaseUrl}/jobs/${jobId}/booking/complete`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as JobApiRecord;
}

async function markPaymentDoneByApi(
  request: APIRequestContext,
  jobId: string,
  accessToken: string
): Promise<JobApiRecord> {
  const response = await request.post(`${apiBaseUrl}/jobs/${jobId}/booking/payment-done`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as JobApiRecord;
}

async function markPaymentReceivedByApi(
  request: APIRequestContext,
  jobId: string,
  accessToken: string
): Promise<JobApiRecord> {
  const response = await request.post(`${apiBaseUrl}/jobs/${jobId}/booking/payment-received`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as JobApiRecord;
}

async function closeBookingByApi(
  request: APIRequestContext,
  jobId: string,
  accessToken: string
): Promise<JobApiRecord> {
  const response = await request.post(`${apiBaseUrl}/jobs/${jobId}/booking/close`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as JobApiRecord;
}

async function getMyVerificationByApi(
  request: APIRequestContext,
  accessToken: string
): Promise<VerificationApiRecord | null> {
  const response = await request.get(`${apiBaseUrl}/profiles/me/verification`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as VerificationApiRecord | null;
}

async function listNotificationsByApi(
  request: APIRequestContext,
  accessToken: string,
  unreadOnly = false
): Promise<NotificationApiRecord[]> {
  const params = new URLSearchParams();
  params.set("limit", "100");
  if (unreadOnly) {
    params.set("unreadOnly", "true");
  }
  const response = await request.get(`${apiBaseUrl}/notifications?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as
    | NotificationApiRecord[]
    | { items?: NotificationApiRecord[]; total?: number; limit?: number; offset?: number };
  return normalizeListResponse(payload);
}

async function getKeycloakAdminAccessToken(
  request: APIRequestContext,
  config: KeycloakAdminConfig
): Promise<string> {
  const response = await request.post(
    `${config.keycloakUrl}/realms/master/protocol/openid-connect/token`,
    {
      form: {
        grant_type: "password",
        client_id: "admin-cli",
        username: config.adminUsername,
        password: config.adminPassword
      }
    }
  );
  if (!response.ok()) {
    const body = await readErrorPayload(response);
    throw new Error(`Keycloak admin token request failed (${response.status()}): ${body}`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("Keycloak admin token response did not contain access_token.");
  }
  return payload.access_token;
}

async function ensureRealmRoleForUser(
  request: APIRequestContext,
  username: string,
  roleName: "admin" | "support"
): Promise<void> {
  const config = readKeycloakAdminConfig();
  const adminToken = await getKeycloakAdminAccessToken(request, config);
  const authHeader = { Authorization: `Bearer ${adminToken}` };

  const usersResponse = await request.get(
    `${config.keycloakUrl}/admin/realms/${encodeURIComponent(config.keycloakRealm)}/users?username=${encodeURIComponent(username)}&exact=true`,
    {
      headers: authHeader
    }
  );
  if (!usersResponse.ok()) {
    const body = await readErrorPayload(usersResponse);
    throw new Error(`Keycloak user lookup failed (${usersResponse.status()}): ${body}`);
  }
  const usersPayload = (await usersResponse.json()) as Array<{ id?: string; username?: string }>;
  const matchedUser = usersPayload.find((item) => item.username === username) ?? usersPayload[0];
  const keycloakUserId = matchedUser?.id;
  if (!keycloakUserId) {
    throw new Error(`Keycloak user '${username}' not found for role assignment.`);
  }

  const roleResponse = await request.get(
    `${config.keycloakUrl}/admin/realms/${encodeURIComponent(config.keycloakRealm)}/roles/${encodeURIComponent(roleName)}`,
    {
      headers: authHeader
    }
  );
  if (!roleResponse.ok()) {
    const body = await readErrorPayload(roleResponse);
    throw new Error(`Keycloak role lookup failed (${roleResponse.status()}): ${body}`);
  }
  const rolePayload = (await roleResponse.json()) as {
    id?: string;
    name?: string;
    composite?: boolean;
    clientRole?: boolean;
    containerId?: string;
  };
  if (!rolePayload.id || !rolePayload.name) {
    throw new Error(`Keycloak role payload for '${roleName}' is missing id/name.`);
  }

  const mappingsResponse = await request.get(
    `${config.keycloakUrl}/admin/realms/${encodeURIComponent(config.keycloakRealm)}/users/${encodeURIComponent(keycloakUserId)}/role-mappings/realm`,
    {
      headers: authHeader
    }
  );
  if (!mappingsResponse.ok()) {
    const body = await readErrorPayload(mappingsResponse);
    throw new Error(`Keycloak role mapping lookup failed (${mappingsResponse.status()}): ${body}`);
  }
  const mappingsPayload = (await mappingsResponse.json()) as Array<{ name?: string }>;
  if (mappingsPayload.some((item) => item.name === roleName)) {
    return;
  }

  const assignResponse = await request.post(
    `${config.keycloakUrl}/admin/realms/${encodeURIComponent(config.keycloakRealm)}/users/${encodeURIComponent(keycloakUserId)}/role-mappings/realm`,
    {
      headers: authHeader,
      data: [
        {
          id: rolePayload.id,
          name: rolePayload.name,
          composite: rolePayload.composite ?? false,
          clientRole: rolePayload.clientRole ?? false,
          containerId: rolePayload.containerId ?? config.keycloakRealm
        }
      ]
    }
  );
  if (!(assignResponse.status() === 204 || assignResponse.status() === 200 || assignResponse.status() === 201)) {
    const body = await readErrorPayload(assignResponse);
    throw new Error(`Keycloak role assignment failed (${assignResponse.status()}): ${body}`);
  }
}

async function requestConnectionByApi(
  request: APIRequestContext,
  accessToken: string,
  targetUserId: string
): Promise<ConnectionRecord> {
  const response = await request.post(`${apiBaseUrl}/connections/request`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    data: {
      targetUserId
    }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ConnectionRecord;
}

async function acceptConnectionByApi(
  request: APIRequestContext,
  accessToken: string,
  connectionId: string
): Promise<ConnectionRecord> {
  const response = await request.post(`${apiBaseUrl}/connections/${connectionId}/accept`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ConnectionRecord;
}

async function requestConnectionByUiWithApiFallback(
  page: Page,
  request: APIRequestContext,
  requesterAccessToken: string,
  requesterUserId: string,
  targetUserId: string
): Promise<ConnectionRecord> {
  await page.goto("/connections");
  await page.getByLabel("Find a person").fill(targetUserId);
  await page.getByRole("button", { name: "Search" }).click();

  const matchCard = page
    .locator(".card")
    .filter({ hasText: `Member ID: ${targetUserId}` })
    .first();
  const matchVisible = await matchCard.isVisible().catch(() => false);

  if (matchVisible) {
    await matchCard.getByRole("button", { name: "Connect" }).click();
    await waitForSuccessMessage(page, "Connection request sent.");
  } else {
    await requestConnectionByApi(request, requesterAccessToken, targetUserId);
  }

  return poll(async () => {
    const connections = await listConnectionsByApi(request, requesterAccessToken);
    const found = connections.find((item) => {
      const users = new Set([item.userAId, item.userBId]);
      return users.has(requesterUserId) && users.has(targetUserId);
    });
    return found;
  }, 30_000);
}

async function poll<T>(action: () => Promise<T | undefined>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await action();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error("Timed out while polling data.");
}

async function waitForSelectOptionLabel(
  select: import("@playwright/test").Locator,
  optionLabel: string,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const labels = await select.locator("option").allTextContents();
    if (labels.some((label) => label.trim() === optionLabel)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Option '${optionLabel}' not found in select before timeout.`);
}

async function waitForSelectOptionValue(
  select: import("@playwright/test").Locator,
  optionValue: string,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const values = await select.locator("option").evaluateAll((options) =>
      options.map((option) => option.getAttribute("value") ?? "")
    );
    if (values.includes(optionValue)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Option value '${optionValue}' not found in select before timeout.`);
}

function isAuthRateLimitedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("http 429") || message.includes("too many authentication attempts");
}

async function waitForAuthRateLimitBackoff(page: Page, attempt: number): Promise<void> {
  const waitMs = Math.min(20_000, 2_500 * attempt);
  await page.waitForTimeout(waitMs);
}

async function registerByUi(page: Page, user: E2eUser): Promise<AuthSessionResponse> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await resetBrowserSession(page);
    await page.goto("/auth/register");
    await page.getByLabel("First name").fill(user.firstName);
    await page.getByLabel("Last name").fill(user.lastName);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("User ID").fill(user.username);
    await page.getByLabel("Phone (optional)").fill("+919876543210");
    await page.getByLabel("Password").fill(user.password);

    const submitButton = page.locator("form button[type='submit']").first();
    const responsePromise = waitForAuthResponse(page, "/auth/register", "POST");
    await submitButton.click();
    try {
      const session = await assertAuthResponse(responsePromise, "register");
      await waitForAuthRedirectOrError(page, /\/jobs$/);
      return session;
    } catch (error) {
      if (attempt < 8 && isAuthRateLimitedError(error)) {
        await waitForAuthRateLimitBackoff(page, attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Register flow did not complete.");
}

async function loginByUi(page: Page, user: E2eUser): Promise<AuthSessionResponse> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await resetBrowserSession(page);
    await page.goto("/auth/login");
    await page.getByLabel("Username or Email").fill(user.username);
    await page.getByLabel("Password").fill(user.password);

    const submitButton = page.locator("form button[type='submit']").first();
    const responsePromise = waitForAuthResponse(page, "/auth/login", "POST");
    await submitButton.click();
    try {
      const session = await assertAuthResponse(responsePromise, "login");
      await waitForAuthRedirectOrError(page, /\/jobs$/);
      return session;
    } catch (error) {
      if (attempt < 8 && isAuthRateLimitedError(error)) {
        await waitForAuthRateLimitBackoff(page, attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Login flow did not complete.");
}

async function applyAdminSessionCookie(page: Page, accessToken: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto(`${adminBaseUrl}/auth/login?e2e_cookie=${Date.now()}`, {
    waitUntil: "domcontentloaded"
  });
  await page.evaluate((token) => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = `illamhelp_admin_access_token=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60}; SameSite=Lax${secure}`;
  }, accessToken);
  await page.goto(`${adminBaseUrl}/`);
  await expect(page.getByTestId("admin-role-pill").first()).toContainText("Admin Access", {
    timeout: 20_000
  });
}

async function applySessionCookie(page: Page, accessToken: string): Promise<void> {
  await resetBrowserSession(page);
  await page.goto("/");
  await page.evaluate((token) => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `illamhelp_access_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}`;
  }, accessToken);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeVisible({
    timeout: 20_000
  });
}

async function signOutByUi(page: Page): Promise<void> {
  const signOut = page.getByRole("button", { name: "Sign out" }).first();
  if (await signOut.isVisible()) {
    await signOut.click();
  }
}

async function resetBrowserSession(page: Page): Promise<void> {
  await page.goto("/");
  const signOut = page.getByRole("button", { name: "Sign out" }).first();
  if (await signOut.isVisible()) {
    await signOut.click();
  }

  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = "illamhelp_access_token=; Path=/; Max-Age=0; SameSite=Lax";
  });

  await page.context().clearCookies();
  await page.goto(`/auth/login?e2e_reset=${Date.now()}`, {
    waitUntil: "domcontentloaded"
  });
  await expect(page.locator("form button[type='submit']").first()).toBeVisible({
    timeout: 10_000
  });
  await expect(page.getByRole("button", { name: "Sign out" }).first()).not.toBeVisible();
}

async function waitForAuthRedirectOrError(page: Page, expectedUrl: RegExp): Promise<void> {
  const timeoutMs = 30_000;
  const started = Date.now();
  const errorBanner = page.locator(".banner.error").first();

  while (Date.now() - started < timeoutMs) {
    if (expectedUrl.test(page.url())) {
      return;
    }

    if (await errorBanner.isVisible().catch(() => false)) {
      const message = await errorBanner.innerText();
      throw new Error(`Auth flow failed: ${message}`);
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Auth flow timed out. Current URL: ${page.url()}`);
}

async function waitForAuthResponse(
  page: Page,
  path: string,
  method: string
): Promise<import("@playwright/test").Response | null> {
  try {
    return await page.waitForResponse(
      (response) =>
        response.url().includes(path) && response.request().method() === method,
      { timeout: 15_000 }
    );
  } catch {
    return null;
  }
}

async function assertAuthResponse(
  responsePromise: Promise<import("@playwright/test").Response | null>,
  action: "register" | "login"
): Promise<AuthSessionResponse> {
  const response = await responsePromise;
  if (!response) {
    throw new Error(`Auth ${action} request was not fired from UI.`);
  }
  if (response.ok()) {
    return (await response.json()) as AuthSessionResponse;
  }

  let payloadText = "";
  try {
    const payload = (await response.json()) as { message?: string | string[]; error?: string };
    if (Array.isArray(payload.message)) {
      payloadText = payload.message.join(", ");
    } else if (typeof payload.message === "string") {
      payloadText = payload.message;
    } else if (typeof payload.error === "string") {
      payloadText = payload.error;
    }
  } catch {
    payloadText = await response.text();
  }

  throw new Error(
    `Auth ${action} failed with HTTP ${response.status()}: ${payloadText || "unknown error"}`
  );
}

test("web UI full flow: auth -> jobs -> connections -> consent", async ({ page, request }) => {
  const seeker = makeUser("seeker");
  const provider = makeUser("provider");

  const shortId = Date.now().toString(36).slice(-4);
  const jobTitle = `E2E job ${shortId}`;
  const requestPurpose = `E2E req ${shortId}`;
  const grantPurpose = `E2E grant ${shortId}`;

  const seekerUiSession = await registerByUi(page, seeker);
  await page.goto("/profile");
  const seekerUserId = parseMemberId(
    await readTextByTestId(page, "profile-user-id"),
    "seeker profile user id"
  );

  await page.goto("/jobs");
  await page.getByLabel("Category").fill("plumber");
  await page.getByLabel("Location text").fill("Kakkanad, Kochi");
  await page.getByLabel("Title").fill(jobTitle);
  await page
    .getByLabel("Description")
    .fill("Need urgent support for kitchen sink leakage in apartment.");
  await page.getByRole("button", { name: "Post job" }).click();
  await waitForSuccessMessage(page, "Job posted successfully.");
  await expect(page.getByText(jobTitle).first()).toBeVisible();
  const seekerApiSession = seekerUiSession;
  const jobId = await poll(async () => {
    const jobs = await listJobsByApi(request, seekerApiSession.accessToken);
    const found = jobs.find(
      (item) => item.seekerUserId === seekerUserId && item.title === jobTitle
    );
    return found?.id;
  });

  await signOutByUi(page);
  const providerUiSession = await registerByUi(page, provider);
  await page.goto("/profile");
  const providerUserId = parseMemberId(
    await readTextByTestId(page, "profile-user-id"),
    "provider profile user id"
  );
  const providerApiSession = providerUiSession;
  const providerApplication = await applyToJobByApi(
    request,
    jobId,
    providerApiSession.accessToken,
    "Can visit today and complete quickly."
  );
  expect(providerApplication.status).toBe("applied");

  const seekerViewApplications = await listJobApplicationsByApi(
    request,
    jobId,
    seekerApiSession.accessToken
  );
  expect(
    seekerViewApplications.some((item) => item.id === providerApplication.id)
  ).toBeTruthy();

  const acceptedApplication = await acceptJobApplicationByApi(
    request,
    providerApplication.id,
    seekerApiSession.accessToken
  );
  expect(acceptedApplication.status).toBe("accepted");

  const startedBooking = await startBookingByApi(
    request,
    jobId,
    providerApiSession.accessToken
  );
  expect(startedBooking.status).toBe("in_progress");
  expect(startedBooking.assignedProviderUserId).toBe(providerUserId);

  const completedBooking = await completeBookingByApi(
    request,
    jobId,
    seekerApiSession.accessToken
  );
  expect(completedBooking.status).toBe("completed");

  const seekerProfileBeforeGrant = await getProfileByApi(
    request,
    seekerUserId,
    providerApiSession.accessToken
  );
  expect(seekerProfileBeforeGrant.visibility.phone).toBe(false);
  expect(seekerProfileBeforeGrant.contact.phone).toBeNull();

  const connection = await requestConnectionByUiWithApiFallback(
    page,
    request,
    providerApiSession.accessToken,
    providerUserId,
    seekerUserId
  );
  const connectionId = connection.id;

  await applySessionCookie(page, seekerUiSession.accessToken);
  await page.goto("/connections");
  const currentConnectionsCard = await cardByHeading(page, "Current connections");
  const seekerConnectionRow = currentConnectionsCard
    .locator("div.grid.two > .card")
    .filter({ hasText: `Other user: ${providerUserId}` })
    .filter({ hasText: `Requested by: ${providerUserId}` })
    .first();
  await expect(seekerConnectionRow).toBeVisible();
  await seekerConnectionRow.getByRole("button", { name: "Accept connection" }).click();
  await expect(seekerConnectionRow.getByText("accepted").first()).toBeVisible();

  await applySessionCookie(page, providerUiSession.accessToken);
  await poll(async () => {
    const providerConnections = await listConnectionsByApi(request, providerApiSession.accessToken);
    const target = providerConnections.find((item) => item.id === connectionId);
    return target?.status === "accepted" ? true : undefined;
  }, 30_000);
  await page.goto("/consent");
  const requestCard = await cardByHeading(page, "Request access");
  const requestPersonSelect = requestCard.getByLabel("Choose person");
  await waitForSelectOptionLabel(requestPersonSelect, seekerUserId);
  await requestPersonSelect.selectOption({ label: seekerUserId });
  await requestCard.getByLabel("Why you need this").fill(requestPurpose);
  await requestCard.getByRole("button", { name: "Request access" }).click();
  await waitForSuccessMessage(page, "Access request submitted.");

  const requestId = await poll(async () => {
    const requests = await listAccessRequestsByApi(request, providerApiSession.accessToken);
    const found = requests.find(
      (item) => item.ownerUserId === seekerUserId && item.purpose === requestPurpose
    );
    return found?.id;
  });

  await applySessionCookie(page, seekerUiSession.accessToken);
  await page.goto("/consent");
  const grantCard = await cardByHeading(page, "Grant access");
  await waitForSelectOptionValue(grantCard.getByLabel("Pending request"), requestId);
  await grantCard.getByLabel("Pending request").selectOption(requestId);
  await grantCard.getByLabel("Why you are approving").fill(grantPurpose);
  await grantCard.getByRole("button", { name: "Grant" }).click();
  await waitForSuccessMessage(page, "Access granted.");
  const seekerProfileAfterGrant = await getProfileByApi(
    request,
    seekerUserId,
    providerApiSession.accessToken
  );
  expect(seekerProfileAfterGrant.visibility.phone).toBe(true);
  expect(seekerProfileAfterGrant.contact.phone).not.toBeNull();

  const grantId = await poll(async () => {
    const grants = await listGrantsByApi(request, seekerApiSession.accessToken);
    const found = grants.find(
      (item) => item.granteeUserId === providerUserId && item.purpose === grantPurpose
    );
    return found?.id;
  });

  await applySessionCookie(page, providerUiSession.accessToken);
  await page.goto("/consent");
  const canViewCardBeforeRevoke = await cardByHeading(page, "Check shared access");
  await canViewCardBeforeRevoke.getByLabel("Choose person").selectOption({ label: seekerUserId });
  await canViewCardBeforeRevoke.getByLabel("Contact detail").selectOption("phone");
  await canViewCardBeforeRevoke.getByRole("button", { name: "Check access" }).click();
  await expect(page.getByText("This contact detail is available to you.").first()).toBeVisible();

  await applySessionCookie(page, seekerUiSession.accessToken);
  await page.goto("/consent");
  const revokeCard = await cardByHeading(page, "Stop sharing");
  await waitForSelectOptionValue(revokeCard.getByLabel("Active share"), grantId);
  await revokeCard.getByLabel("Active share").selectOption(grantId);
  await revokeCard.getByLabel("Reason").fill("E2E revoke validation");
  await revokeCard.getByRole("button", { name: "Revoke" }).click();
  await waitForSuccessMessage(page, "Access revoked.");

  await applySessionCookie(page, providerUiSession.accessToken);
  await page.goto("/consent");
  const canViewCardAfterRevoke = await cardByHeading(page, "Check shared access");
  await canViewCardAfterRevoke.getByLabel("Choose person").selectOption({ label: seekerUserId });
  await canViewCardAfterRevoke.getByLabel("Contact detail").selectOption("phone");
  await canViewCardAfterRevoke.getByRole("button", { name: "Check access" }).click();
  await expect(
    page.getByText("This contact detail is not available right now.").first()
  ).toBeVisible();
  const seekerProfileAfterRevoke = await getProfileByApi(
    request,
    seekerUserId,
    providerApiSession.accessToken
  );
  expect(seekerProfileAfterRevoke.visibility.phone).toBe(false);
  expect(seekerProfileAfterRevoke.contact.phone).toBeNull();

  await page.goto("/connections");
  const providerConnectionsCard = await cardByHeading(page, "Current connections");
  const providerConnectionRow = providerConnectionsCard
    .locator("div.grid.two > .card")
    .filter({ hasText: `Connected with: ${seekerUserId}` })
    .first();
  await expect(providerConnectionRow).toBeVisible();
  const blockButton = providerConnectionRow.getByRole("button", { name: /block/i }).first();
  await blockButton.click();
  await waitForSuccessMessage(page, "Person blocked.");
  await expect(providerConnectionRow.getByText("blocked").first()).toBeVisible();

  expect(parseUuid(connectionId, "connectionId")).toBeTruthy();
  expect(parseUuid(requestId, "requestId")).toBeTruthy();
  expect(parseUuid(grantId, "grantId")).toBeTruthy();
  expect(parseUuid(jobId, "jobId")).toBeTruthy();
  expect(parseUuid(providerApplication.id, "applicationId")).toBeTruthy();
});

test("web E2E connection lifecycle: decline -> re-request -> accept -> block", async ({
  page,
  request
}) => {
  const requester = makeUser("both");
  const owner = makeUser("both");

  const requesterUiSession = await registerByUi(page, requester);
  await page.goto("/profile");
  const requesterUserId = parseMemberId(
    await readTextByTestId(page, "profile-user-id"),
    "requester profile user id"
  );
  const requesterApiSession = requesterUiSession;

  await signOutByUi(page);
  const ownerUiSession = await registerByUi(page, owner);
  await page.goto("/profile");
  const ownerUserId = parseMemberId(
    await readTextByTestId(page, "profile-user-id"),
    "owner profile user id"
  );
  const ownerApiSession = ownerUiSession;

  await applySessionCookie(page, requesterUiSession.accessToken);
  const firstRequested = await requestConnectionByUiWithApiFallback(
    page,
    request,
    requesterApiSession.accessToken,
    requesterUserId,
    ownerUserId
  );
  const firstConnectionId = firstRequested.id;

  await applySessionCookie(page, ownerUiSession.accessToken);
  await page.goto("/connections");
  const ownerConnectionsCard = await cardByHeading(page, "Current connections");
  const firstPendingRow = ownerConnectionsCard
    .locator("div.grid.two > .card")
    .filter({ hasText: `Other user: ${requesterUserId}` })
    .filter({ hasText: `Requested by: ${requesterUserId}` })
    .filter({ hasText: "pending" })
    .first();
  await expect(firstPendingRow).toBeVisible();
  await firstPendingRow.getByRole("button", { name: "Decline request" }).click();
  await waitForSuccessMessage(page, "Connection request declined.");

  await poll(async () => {
    const connections = await listConnectionsByApi(request, ownerApiSession.accessToken);
    const found = connections.find(
      (item) => item.id === firstConnectionId && item.status === "declined"
    );
    return found?.id;
  }, 30_000);

  await applySessionCookie(page, requesterUiSession.accessToken);
  const reopened = await requestConnectionByUiWithApiFallback(
    page,
    request,
    requesterApiSession.accessToken,
    requesterUserId,
    ownerUserId
  );
  const activeConnectionId = reopened.id;
  expect(activeConnectionId).toBe(firstConnectionId);

  await applySessionCookie(page, ownerUiSession.accessToken);
  await page.goto("/connections");
  const secondPendingRow = ownerConnectionsCard
    .locator("div.grid.two > .card")
    .filter({ hasText: `Other user: ${requesterUserId}` })
    .filter({ hasText: `Requested by: ${requesterUserId}` })
    .filter({ hasText: "pending" })
    .first();
  await expect(secondPendingRow).toBeVisible();
  await secondPendingRow.getByRole("button", { name: "Accept connection" }).click();
  await waitForSuccessMessage(page, "Connection accepted.");

  await poll(async () => {
    const connections = await listConnectionsByApi(request, ownerApiSession.accessToken);
    const found = connections.find(
      (item) => item.id === activeConnectionId && item.status === "accepted"
    );
    return found?.id;
  }, 30_000);

  const acceptedRow = ownerConnectionsCard
    .locator("div.grid.two > .card")
    .filter({ hasText: `Other user: ${requesterUserId}` })
    .filter({ hasText: "accepted" })
    .first();
  await expect(acceptedRow).toBeVisible();
  await acceptedRow.getByRole("button", { name: /block person/i }).click();
  await waitForSuccessMessage(page, "Person blocked.");

  await poll(async () => {
    const connections = await listConnectionsByApi(request, ownerApiSession.accessToken);
    const found = connections.find(
      (item) => item.id === activeConnectionId && item.status === "blocked"
    );
    return found?.id;
  }, 30_000);

  expect(parseUuid(firstConnectionId, "firstConnectionId")).toBeTruthy();
  expect(parseUuid(activeConnectionId, "activeConnectionId")).toBeTruthy();
});

test("web E2E jobs visibility: connections_only blocks non-connections", async ({
  page,
  request
}) => {
  const seeker = makeUser("both");
  const provider = makeUser("both");
  const shortId = Date.now().toString(36).slice(-4);
  const title = `Connections only ${shortId}`;

  const seekerUiSession = await registerByUi(page, seeker);
  await page.goto("/profile");
  const seekerUserId = parseMemberId(
    await readTextByTestId(page, "profile-user-id"),
    "visibility seeker profile user id"
  );

  await page.goto("/jobs");
  await page.getByLabel("Category").fill("plumber");
  await page.getByLabel("Location text").fill("Kochi, Kakkanad");
  await page.getByLabel("Title").fill(title);
  await page
    .getByLabel("Description")
    .fill("Connections-only job posting for visibility access checks.");
  await page
    .locator("form")
    .first()
    .locator("select")
    .first()
    .selectOption("connections_only");
  await page.getByRole("button", { name: "Post job" }).click();
  await waitForSuccessMessage(page, "Job posted successfully.");
  await expect(page.getByText("Visibility: Connections only").first()).toBeVisible();

  const jobId = await poll(async () => {
    const jobs = await listJobsByApi(request, seekerUiSession.accessToken);
    const found = jobs.find((item) => item.seekerUserId === seekerUserId && item.title === title);
    return found?.id;
  }, 30_000);

  await signOutByUi(page);
  const providerUiSession = await registerByUi(page, provider);
  await page.goto("/profile");
  const providerUserId = parseMemberId(
    await readTextByTestId(page, "profile-user-id"),
    "visibility provider profile user id"
  );

  const deniedApplyResponse = await request.post(`${apiBaseUrl}/jobs/${jobId}/apply`, {
    headers: {
      Authorization: `Bearer ${providerUiSession.accessToken}`
    },
    data: {
      message: "Can visit today."
    }
  });
  expect(deniedApplyResponse.status()).toBe(400);

  const requestedConnection = await requestConnectionByApi(
    request,
    providerUiSession.accessToken,
    seekerUserId
  );
  const acceptedConnection = await acceptConnectionByApi(
    request,
    seekerUiSession.accessToken,
    requestedConnection.id
  );
  expect(acceptedConnection.status).toBe("accepted");

  const applied = await applyToJobByApi(
    request,
    jobId,
    providerUiSession.accessToken,
    "Can visit today."
  );
  expect(applied.status).toBe("applied");
  expect(parseMemberId(providerUserId, "visibility provider id")).toBeTruthy();
});

test("web E2E booking lifecycle: apply -> accept -> in_progress -> completed -> payment -> closed", async ({
  page,
  request
}) => {
  const seeker = makeUser("seeker");
  const provider = makeUser("provider");
  const shortId = Date.now().toString(36).slice(-4);
  const jobTitle = `Booking E2E ${shortId}`;

  const seekerUiSession = await registerByUi(page, seeker);
  await page.goto("/profile");
  const seekerUserId = parseMemberId(
    await readTextByTestId(page, "profile-user-id"),
    "booking seeker profile user id"
  );
  const seekerApiSession = seekerUiSession;

  await page.goto("/jobs");
  await page.getByLabel("Category").fill("electrician");
  await page.getByLabel("Location text").fill("Kakkanad, Kochi");
  await page.getByLabel("Title").fill(jobTitle);
  await page
    .getByLabel("Description")
    .fill("Need an electrician to inspect repeated power trip in kitchen.");
  await page.getByRole("button", { name: "Post job" }).click();
  await waitForSuccessMessage(page, "Job posted successfully.");
  await expect(page.getByText(jobTitle).first()).toBeVisible();

  const jobId = await poll(async () => {
    const jobs = await listJobsByApi(request, seekerApiSession.accessToken);
    const found = jobs.find(
      (item) => item.seekerUserId === seekerUserId && item.title === jobTitle
    );
    return found?.id;
  }, 30_000);

  await signOutByUi(page);
  const providerUiSession = await registerByUi(page, provider);
  const providerApiSession = providerUiSession;
  const providerApplication = await applyToJobByApi(
    request,
    jobId,
    providerApiSession.accessToken,
    "Can visit this evening and complete the diagnosis."
  );
  expect(providerApplication.status).toBe("applied");

  const acceptedApplication = await acceptJobApplicationByApi(
    request,
    providerApplication.id,
    seekerApiSession.accessToken
  );
  expect(acceptedApplication.status).toBe("accepted");

  const startedBooking = await startBookingByApi(
    request,
    jobId,
    providerApiSession.accessToken
  );
  expect(startedBooking.status).toBe("in_progress");

  const completedBooking = await completeBookingByApi(
    request,
    jobId,
    seekerApiSession.accessToken
  );
  expect(completedBooking.status).toBe("completed");

  const paymentDone = await markPaymentDoneByApi(
    request,
    jobId,
    seekerApiSession.accessToken
  );
  expect(paymentDone.status).toBe("payment_done");

  const paymentReceived = await markPaymentReceivedByApi(
    request,
    jobId,
    providerApiSession.accessToken
  );
  expect(paymentReceived.status).toBe("payment_received");

  const closed = await closeBookingByApi(
    request,
    jobId,
    seekerApiSession.accessToken
  );
  expect(closed.status).toBe("closed");

  await applySessionCookie(page, providerUiSession.accessToken);
  await page.goto(`/jobs/${jobId}`);
  await expect(page.getByRole("heading", { name: jobTitle }).first()).toBeVisible();
  await expect(page.getByText("closed").first()).toBeVisible();

  expect(parseUuid(jobId, "booking job id")).toBeTruthy();
  expect(parseUuid(providerApplication.id, "booking application id")).toBeTruthy();
});

test("web E2E verification lifecycle: submit -> admin review -> user notification", async ({
  browser,
  request
}) => {
  const member = makeUser("both");
  const adminCandidate = makeUser("both");
  const shortId = Date.now().toString(36).slice(-4);
  const reviewNote = `Verification approved in E2E ${shortId}`;
  const documentMediaId = "11111111-1111-4111-8111-111111111111";

  const memberPage = await browser.newPage();
  const adminPage = await browser.newPage();

  try {
    const memberSession = await registerByUi(memberPage, member);
    await memberPage.goto("/verification");
    await memberPage.getByLabel("Document media IDs").fill(documentMediaId);
    await memberPage
      .getByLabel("Notes (optional)")
      .fill("Government ID uploaded for verification workflow E2E.");
    await memberPage.getByRole("button", { name: "Submit verification request" }).click();
    await waitForSuccessMessage(
      memberPage,
      "Verification request submitted! We'll review your documents shortly."
    );

    const createdRequest = await poll(async () => {
      const verification = await getMyVerificationByApi(request, memberSession.accessToken);
      if (!verification) {
        return undefined;
      }
      return verification.status === "pending" ? verification : undefined;
    }, 30_000);

    const verificationRequestId = createdRequest.id;
    expect(parseUuid(verificationRequestId, "verification request id")).toBeTruthy();

    await registerByUi(adminPage, adminCandidate);
    await signOutByUi(adminPage);
    await ensureRealmRoleForUser(request, adminCandidate.username, "admin");

    const adminSession = await poll(async () => {
      const session = await loginByApi(request, adminCandidate);
      const me = await authMeByApi(request, session.accessToken);
      return me.roles.includes("admin") ? session : undefined;
    }, 40_000);

    await applyAdminSessionCookie(adminPage, adminSession.accessToken);

    await adminPage.goto(`${adminBaseUrl}/verifications`);
    const verificationCard = await poll(async () => {
      const candidate = adminPage
        .locator(".card")
        .filter({ hasText: memberSession.userId })
        .first();
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
      await adminPage.reload({ waitUntil: "domcontentloaded" });
      return undefined;
    }, 45_000);
    await verificationCard.getByRole("button", { name: "Review" }).click();
    await verificationCard
      .getByPlaceholder("Reason for approval or rejection...")
      .fill(reviewNote);
    await verificationCard.getByRole("button", { name: /Approve/i }).click();
    await expect(adminPage.getByText(/Verification approved/i).first()).toBeVisible();

    const reviewed = await poll(async () => {
      const verification = await getMyVerificationByApi(request, memberSession.accessToken);
      return verification?.status === "approved" ? verification : undefined;
    }, 30_000);
    expect(reviewed.reviewerUserId).toBe(adminSession.userId);
    expect(reviewed.reviewerNotes).toBe(reviewNote);

    await poll(async () => {
      const notifications = await listNotificationsByApi(request, memberSession.accessToken, true);
      return notifications.some(
        (item) => item.type === "verification_approved" && item.title.includes("Verification approved")
      )
        ? true
        : undefined;
    }, 30_000);

    await memberPage.goto("/notifications");
    await expect(memberPage.getByText("Verification approved!").first()).toBeVisible();

    await memberPage.goto("/verification");
    await expect(memberPage.getByText("✅ Approved").first()).toBeVisible();
    await expect(memberPage.getByText(reviewNote).first()).toBeVisible();
  } finally {
    await memberPage.close();
    await adminPage.close();
  }
});
