import { expect, Locator, Page } from "@playwright/test";

export const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

export interface E2eUser {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  password: string;
  userType: "seeker" | "provider" | "both";
}

const MEMBER_ID_PATTERN = /\b[a-z0-9._-]{3,40}\b/i;

function suffix(): string {
  const ts = Date.now().toString(36).slice(-5);
  const rand = Math.random().toString(36).slice(2, 5);
  return `${ts}${rand}`;
}

export function makeUser(type: E2eUser["userType"]): E2eUser {
  const id = suffix();
  const prefix = type === "seeker" ? "s" : type === "provider" ? "p" : "b";
  const shortId = id.slice(-4);
  return {
    firstName: `${type === "seeker" ? "Se" : type === "provider" ? "Pr" : "Mb"}${shortId}`,
    lastName: `E2E${shortId}`,
    email: `${prefix}${id}@i.test`,
    username: `${prefix}_${id}`,
    password: `Ih#${id}9A`,
    userType: type
  };
}

export function parseUuid(value: string, context: string): string {
  const match = value.match(UUID_PATTERN);
  if (!match) {
    throw new Error(`Unable to parse UUID for ${context}. Value: ${value}`);
  }
  return match[0];
}

export function parseMemberId(value: string, context: string): string {
  const normalized = value
    .replace(/^member id:\s*/i, "")
    .replace(/^user id:\s*/i, "")
    .trim();
  const match = normalized.match(MEMBER_ID_PATTERN);
  if (!match) {
    throw new Error(`Unable to parse member id for ${context}. Value: ${value}`);
  }
  return match[0];
}

export async function readUuidByLabel(page: Page, label: string): Promise<string> {
  const text = await page.locator("body").innerText();
  const lines = text
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const targetIndex = lines.findIndex((item) => item.startsWith(label));
  if (targetIndex < 0) {
    throw new Error(`Could not find line that starts with '${label}'`);
  }

  const sameLine = lines[targetIndex];
  const sameLineMatch = sameLine.match(UUID_PATTERN);
  if (sameLineMatch) {
    return sameLineMatch[0];
  }

  // In card layouts, label and value are often rendered in separate lines.
  for (let offset = 1; offset <= 3; offset += 1) {
    const nextLine = lines[targetIndex + offset];
    if (!nextLine) {
      break;
    }
    const nextMatch = nextLine.match(UUID_PATTERN);
    if (nextMatch) {
      return nextMatch[0];
    }
  }

  throw new Error(`Unable to parse UUID for ${label}.`);
}

export async function readUuidByTestId(page: Page, testId: string): Promise<string> {
  const locator = page.getByTestId(testId).first();
  await expect(locator).toBeVisible();
  const text = (await locator.innerText()).trim();
  return parseUuid(text, testId);
}

export async function readTextByTestId(page: Page, testId: string): Promise<string> {
  const locator = page.getByTestId(testId).first();
  await expect(locator).toBeVisible();
  return (await locator.innerText()).trim();
}

export async function cardByHeading(page: Page, heading: string): Promise<Locator> {
  const card = page.locator(".card, .MuiPaper-root").filter({
    has: page.getByRole("heading", { name: heading, exact: true })
  });
  await expect(card.first()).toBeVisible();
  return card.first();
}

export async function waitForSuccessMessage(page: Page, message: string): Promise<void> {
  await expect(page.getByText(message).first()).toBeVisible({ timeout: 10_000 });
}

export async function waitForSignInRequired(page: Page): Promise<void> {
  await expect(page.getByText("Sign in required")).toBeVisible({ timeout: 10_000 });
}

export async function registerAuditMember(page: Page, origin: string): Promise<E2eUser> {
  const user = makeUser("both");
  await page.goto(`${origin}/auth/register`);
  const main = page.getByRole("main");
  const firstName = main.getByLabel("First name", { exact: true });
  await expect(firstName).toBeVisible();
  await declineMemberAnalytics(page);
  await firstName.fill(user.firstName);
  await main.getByLabel("Last name", { exact: true }).fill(user.lastName);
  await main.getByLabel("Email", { exact: true }).fill(user.email);
  await main.getByLabel("Member ID", { exact: true }).fill(user.username);
  await main.getByLabel("Password", { exact: true }).fill(user.password);
  await main.getByLabel(/I agree to the current Terms and Conditions and Privacy Policy/i).check();
  await main.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs(?:\/discover)?$/);
  return user;
}

const analyticsChoiceHandled = new WeakSet<ReturnType<Page["context"]>>();

export async function openSignedOutMemberHome(page: Page, origin: string): Promise<void> {
  await page.goto(origin);
  const signOut = page.getByRole("button", { name: "Sign out", exact: true }).first();
  const signIn = page.getByRole("link", { name: "Sign in", exact: true }).first();
  await expect(signOut.or(signIn).first()).toBeVisible();
  if (await signOut.isVisible()) {
    await signOut.click();
    await expect(signIn).toBeVisible();
  }
  if (analyticsChoiceHandled.has(page.context())) return;

  await declineMemberAnalytics(page);
  analyticsChoiceHandled.add(page.context());
}


export async function declineMemberAnalytics(page: Page): Promise<void> {
  if (process.env.PW_E2E_ANALYTICS_CONSENT === "granted") return;
  const decline = page.getByRole("button", { name: "Decline analytics", exact: true });
  await expect(decline).toBeVisible();
  // The same control can briefly remount as the landing session resolves.
  await expect(async () => {
    if (await decline.isVisible()) await decline.click({ timeout: 1500 });
    await expect(decline).toBeHidden({ timeout: 750 });
  }).toPass({ timeout: 5000 });
}
