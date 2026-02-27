import { expect, APIRequestContext, Page, test } from "@playwright/test";

import {
  cardByHeading,
  E2eUser,
  makeUser,
  parseUuid,
  readUuidByTestId,
  waitForSuccessMessage
} from "../utils/flow-helpers";

const apiBaseUrl = process.env.PW_API_BASE_URL ?? "http://localhost:4000/api/v1";

type AuthSessionResponse = {
  userId: string;
  accessToken: string;
};

type ConnectionRecord = {
  id: string;
  userAId: string;
  userBId: string;
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
  return (await response.json()) as ConnectionRecord[];
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
  return (await response.json()) as AccessRequestRecord[];
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
  return (await response.json()) as ConsentGrantRecord[];
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

async function registerByUi(page: Page, user: E2eUser): Promise<void> {
  await resetBrowserSession(page);
  await page.goto("/auth/register");
  await page.getByLabel("First name").fill(user.firstName);
  await page.getByLabel("Last name").fill(user.lastName);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Username (optional)").fill(user.username);
  await page.getByLabel("Phone (optional)").fill("+919876543210");
  await page.getByLabel("Password").fill(user.password);

  const submitButton = page.locator("form button[type='submit']").first();
  const responsePromise = waitForAuthResponse(page, "/auth/register", "POST");
  await submitButton.click();
  await assertAuthResponse(responsePromise, "register");
  await waitForAuthRedirectOrError(page, /\/jobs$/);
}

async function loginByUi(page: Page, user: E2eUser): Promise<void> {
  await resetBrowserSession(page);
  await page.goto("/auth/login");
  await page.getByLabel("Username or Email").fill(user.username);
  await page.getByLabel("Password").fill(user.password);

  const submitButton = page.locator("form button[type='submit']").first();
  const responsePromise = waitForAuthResponse(page, "/auth/login", "POST");
  await submitButton.click();
  await assertAuthResponse(responsePromise, "login");
  await waitForAuthRedirectOrError(page, /\/jobs$/);
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
): Promise<void> {
  const response = await responsePromise;
  if (!response) {
    throw new Error(`Auth ${action} request was not fired from UI.`);
  }
  if (response.ok()) {
    return;
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

test.describe.configure({ mode: "serial" });

test("web UI full flow: auth -> jobs -> connections -> consent", async ({ page, request }) => {
  const seeker = makeUser("seeker");
  const provider = makeUser("provider");

  const shortId = Date.now().toString(36).slice(-4);
  const jobTitle = `E2E job ${shortId}`;
  const requestPurpose = `E2E req ${shortId}`;
  const grantPurpose = `E2E grant ${shortId}`;

  await registerByUi(page, seeker);
  await page.goto("/profile");
  const seekerUserId = await readUuidByTestId(page, "profile-user-id");

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
  const seekerApiSession = await loginByApi(request, seeker);

  await signOutByUi(page);
  await registerByUi(page, provider);
  await page.goto("/profile");
  const providerUserId = await readUuidByTestId(page, "profile-user-id");
  const providerApiSession = await loginByApi(request, provider);
  const seekerProfileBeforeGrant = await getProfileByApi(
    request,
    seekerUserId,
    providerApiSession.accessToken
  );
  expect(seekerProfileBeforeGrant.visibility.phone).toBe(false);
  expect(seekerProfileBeforeGrant.contact.phone).toBeNull();

  await page.goto("/connections");
  await page.getByLabel("Find a person").fill(`${seeker.firstName} kakkanad`);
  await page.getByRole("button", { name: "Search" }).click();
  const seekerMatchCard = page.locator("section.card").filter({
    hasText: `Member ID: ${seekerUserId}`
  });
  await expect(seekerMatchCard.first()).toBeVisible();
  await seekerMatchCard.first().getByRole("button", { name: "Connect" }).click();
  await waitForSuccessMessage(page, "Connection request sent.");

  const connectionId = await poll(async () => {
    const connections = await listConnectionsByApi(request, providerApiSession.accessToken);
    const found = connections.find((item) => {
      const users = new Set([item.userAId, item.userBId]);
      return users.has(seekerUserId) && users.has(providerUserId);
    });
    return found?.id;
  });

  await signOutByUi(page);
  await loginByUi(page, seeker);
  await page.goto("/connections");
  const currentConnectionsCard = await cardByHeading(page, "Current connections");
  const seekerConnectionRow = currentConnectionsCard
    .locator("div.grid.two > section.card")
    .filter({ hasText: `Other user: ${providerUserId}` })
    .filter({ hasText: `Requested by: ${providerUserId}` })
    .first();
  await expect(seekerConnectionRow).toBeVisible();
  await seekerConnectionRow.getByRole("button", { name: "Accept connection" }).click();
  await expect(seekerConnectionRow.getByText("accepted").first()).toBeVisible();

  await signOutByUi(page);
  await loginByUi(page, provider);
  await page.goto("/consent");
  const requestCard = await cardByHeading(page, "Request access");
  await requestCard.getByLabel("Person's member ID").fill(seekerUserId);
  await requestCard.getByLabel("Connection reference ID").fill(connectionId);
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

  await signOutByUi(page);
  await loginByUi(page, seeker);
  await page.goto("/consent");
  const grantCard = await cardByHeading(page, "Grant access");
  await grantCard.getByLabel("Request reference ID").fill(requestId);
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

  await signOutByUi(page);
  await loginByUi(page, provider);
  await page.goto("/consent");
  const canViewCardBeforeRevoke = await cardByHeading(page, "Check shared access");
  await canViewCardBeforeRevoke.getByLabel("Person's member ID").fill(seekerUserId);
  await canViewCardBeforeRevoke.getByLabel("Contact detail").selectOption("phone");
  await canViewCardBeforeRevoke.getByRole("button", { name: "Check access" }).click();
  await expect(page.getByText("This contact detail is available to you.").first()).toBeVisible();

  await signOutByUi(page);
  await loginByUi(page, seeker);
  await page.goto("/consent");
  const revokeCard = await cardByHeading(page, "Stop sharing");
  await revokeCard.getByLabel("Grant reference ID").fill(grantId);
  await revokeCard.getByLabel("Reason").fill("E2E revoke validation");
  await revokeCard.getByRole("button", { name: "Revoke" }).click();
  await waitForSuccessMessage(page, "Access revoked.");

  await signOutByUi(page);
  await loginByUi(page, provider);
  await page.goto("/consent");
  const canViewCardAfterRevoke = await cardByHeading(page, "Check shared access");
  await canViewCardAfterRevoke.getByLabel("Person's member ID").fill(seekerUserId);
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
    .locator("div.grid.two > section.card")
    .filter({ hasText: `Connection ID: ${connectionId}` })
    .first();
  await expect(providerConnectionRow).toBeVisible();
  const blockButton = providerConnectionRow.getByRole("button", { name: /block/i }).first();
  await blockButton.click();
  await waitForSuccessMessage(page, "Person blocked.");
  await expect(providerConnectionRow.getByText("blocked").first()).toBeVisible();

  expect(parseUuid(connectionId, "connectionId")).toBeTruthy();
  expect(parseUuid(requestId, "requestId")).toBeTruthy();
  expect(parseUuid(grantId, "grantId")).toBeTruthy();
});
