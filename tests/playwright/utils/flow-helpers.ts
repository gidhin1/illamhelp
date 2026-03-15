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
  const card = page.locator(".card").filter({
    has: page.getByRole("heading", { name: heading })
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

function normalizeCategoryToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const JOB_CATEGORY_ALIASES: Record<string, string[]> = {
  plumber: ["plumbing"],
  plumbing: ["plumbing"],
  electrician: ["electrical"],
  electrical: ["electrical"],
  cleaner: ["cleaning"],
  cleaning: ["cleaning"],
  "elder care": ["elder care"],
  eldercare: ["elder care"],
  "home security": ["security"],
  security: ["security"]
};

export async function selectJobCategoryOption(
  select: Locator,
  requestedCategory: string
): Promise<"catalog" | "custom"> {
  const normalizedRequested = normalizeCategoryToken(requestedCategory);
  const aliases = [
    normalizedRequested,
    ...(JOB_CATEGORY_ALIASES[normalizedRequested] ?? [])
  ];

  const options = await select.locator("option").evaluateAll((rows) =>
    rows.map((option) => {
      const cast = option as HTMLOptionElement;
      return {
        value: cast.value,
        label: cast.textContent?.trim() ?? ""
      };
    })
  );

  const directMatch = options.find((option) => {
    const normalizedValue = normalizeCategoryToken(option.value);
    const normalizedLabel = normalizeCategoryToken(option.label);
    return aliases.some(
      (alias) =>
        alias === normalizedValue ||
        alias === normalizedLabel ||
        normalizedValue.includes(alias) ||
        normalizedLabel.includes(alias)
    );
  });

  if (directMatch) {
    await select.selectOption(directMatch.value);
    const normalizedSelected =
      normalizeCategoryToken(directMatch.value) || normalizeCategoryToken(directMatch.label);
    return normalizedSelected === "other" ? "custom" : "catalog";
  }

  const otherOption = options.find((option) => {
    const normalizedValue = normalizeCategoryToken(option.value);
    const normalizedLabel = normalizeCategoryToken(option.label);
    return normalizedValue === "other" || normalizedLabel === "other";
  });

  if (!otherOption) {
    throw new Error(`No category option matched '${requestedCategory}' and no custom 'Other' option is available.`);
  }

  await select.selectOption(otherOption.value);
  return "custom";
}
