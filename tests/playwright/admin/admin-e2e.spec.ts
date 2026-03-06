import { expect, APIRequestContext, Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { E2eUser, makeUser, parseUuid } from "../utils/flow-helpers";

const apiBaseUrl =
  process.env.PW_ADMIN_API_BASE_URL ??
  process.env.PW_API_BASE_URL ??
  "http://localhost:4011/api/v1";

type AuthSession = {
  userId: string;
  accessToken: string;
};

type AuthMeResponse = {
  userId: string;
  roles: string[];
};

type VerificationRecord = {
  id: string;
  userId: string;
  status: "pending" | "under_review" | "approved" | "rejected";
  reviewerUserId: string | null;
  reviewerNotes: string | null;
};

type NotificationRecord = {
  id: string;
  type: string;
  title: string;
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
    throw new Error("KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD are required for admin E2E tests.");
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

function isRateLimitedStatus(status: number): boolean {
  return status === 429;
}

async function waitForRateLimitBackoff(page: Page, attempt: number): Promise<void> {
  const waitMs = Math.min(20_000, 2_000 * attempt);
  await page.waitForTimeout(waitMs);
}

async function registerByApi(
  request: APIRequestContext,
  page: Page,
  user: E2eUser
): Promise<void> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const response = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        username: user.username,
        email: user.email,
        password: user.password,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: "+919876543210"
      }
    });

    if (response.ok()) {
      return;
    }

    if (attempt < 8 && isRateLimitedStatus(response.status())) {
      await waitForRateLimitBackoff(page, attempt);
      continue;
    }

    const payload = await readErrorPayload(response);
    throw new Error(`Register failed (${response.status()}): ${payload}`);
  }

  throw new Error("Register did not complete after retries.");
}

async function loginByApi(
  request: APIRequestContext,
  page: Page,
  user: E2eUser
): Promise<AuthSession> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const response = await request.post(`${apiBaseUrl}/auth/login`, {
      data: {
        username: user.username,
        password: user.password
      }
    });

    if (response.ok()) {
      return (await response.json()) as AuthSession;
    }

    if (attempt < 8 && isRateLimitedStatus(response.status())) {
      await waitForRateLimitBackoff(page, attempt);
      continue;
    }

    const payload = await readErrorPayload(response);
    throw new Error(`Login failed (${response.status()}): ${payload}`);
  }

  throw new Error("Login did not complete after retries.");
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
  if (!response.ok()) {
    const payload = await readErrorPayload(response);
    throw new Error(`auth/me failed (${response.status()}): ${payload}`);
  }
  return (await response.json()) as AuthMeResponse;
}

async function submitVerificationByApi(
  request: APIRequestContext,
  accessToken: string,
  notes: string
): Promise<VerificationRecord> {
  const response = await request.post(`${apiBaseUrl}/profiles/me/verification`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    data: {
      documentType: "government_id",
      documentMediaIds: ["11111111-1111-4111-8111-111111111111"],
      notes
    }
  });
  if (!response.ok()) {
    const payload = await readErrorPayload(response);
    throw new Error(`Submit verification failed (${response.status()}): ${payload}`);
  }
  return (await response.json()) as VerificationRecord;
}

async function getMyVerificationByApi(
  request: APIRequestContext,
  accessToken: string
): Promise<VerificationRecord | null> {
  const response = await request.get(`${apiBaseUrl}/profiles/me/verification`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok()) {
    const payload = await readErrorPayload(response);
    throw new Error(`Get my verification failed (${response.status()}): ${payload}`);
  }
  return (await response.json()) as VerificationRecord | null;
}

async function listNotificationsByApi(
  request: APIRequestContext,
  accessToken: string,
  unreadOnly = false
): Promise<NotificationRecord[]> {
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
  if (!response.ok()) {
    const payload = await readErrorPayload(response);
    throw new Error(`List notifications failed (${response.status()}): ${payload}`);
  }
  const payload = (await response.json()) as
    | NotificationRecord[]
    | { items?: NotificationRecord[]; total?: number; limit?: number; offset?: number };
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload.items) ? payload.items : [];
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
  if (
    !(
      assignResponse.status() === 204 ||
      assignResponse.status() === 200 ||
      assignResponse.status() === 201
    )
  ) {
    const body = await readErrorPayload(assignResponse);
    throw new Error(`Keycloak role assignment failed (${assignResponse.status()}): ${body}`);
  }
}

async function poll<T>(
  callback: () => Promise<T | undefined>,
  timeoutMs = 30_000,
  intervalMs = 800
): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await callback();
    if (typeof result !== "undefined") {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out while polling data.");
}

test("admin portal E2E verification lifecycle: member submit -> admin review -> member notification", async ({
  page,
  request
}) => {
  const member = makeUser("both");
  const adminCandidate = makeUser("both");
  const shortId = Date.now().toString(36).slice(-4);
  const reviewNote = `Approved by admin portal E2E ${shortId}`;

  await registerByApi(request, page, member);
  await registerByApi(request, page, adminCandidate);

  const memberSession = await loginByApi(request, page, member);
  const created = await submitVerificationByApi(
    request,
    memberSession.accessToken,
    "Government ID submitted for admin portal E2E verification."
  );
  expect(created.status).toBe("pending");
  expect(parseUuid(created.id, "verification request id")).toBeTruthy();

  await ensureRealmRoleForUser(request, adminCandidate.username, "admin");

  const adminSession = await poll(async () => {
    const session = await loginByApi(request, page, adminCandidate);
    const me = await authMeByApi(request, session.accessToken);
    return me.roles.includes("admin") ? session : undefined;
  }, 40_000);

  await page.goto("/auth/login");
  await page.getByLabel("Username or email").fill(adminCandidate.username);
  await page.getByLabel("Password").fill(adminCandidate.password);
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("admin-role-pill")).toContainText("Admin Access");

  await page.goto("/verifications");
  const verificationCard = page.locator(".card").filter({ hasText: memberSession.userId }).first();
  await expect(verificationCard).toBeVisible({ timeout: 30_000 });
  await verificationCard.getByRole("button", { name: "Review" }).click();
  await verificationCard
    .getByPlaceholder("Reason for approval or rejection...")
    .fill(reviewNote);
  await verificationCard.getByRole("button", { name: /Approve/i }).click();

  await expect(page.getByText(/Verification approved/i).first()).toBeVisible();

  const verifiedRecord = await poll(async () => {
    const current = await getMyVerificationByApi(request, memberSession.accessToken);
    return current?.status === "approved" ? current : undefined;
  }, 30_000);
  expect(verifiedRecord.reviewerUserId).toBe(adminSession.userId);
  expect(verifiedRecord.reviewerNotes).toBe(reviewNote);

  const approvalNotification = await poll(async () => {
    const notifications = await listNotificationsByApi(request, memberSession.accessToken, true);
    return notifications.find((item) => item.type === "verification_approved");
  }, 30_000);
  expect(approvalNotification.title).toContain("Verification approved");
});
