const ACCESS_TOKEN_KEY = "illamhelp_access_token";
const REFRESH_TOKEN_KEY = "illamhelp_refresh_token";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;
const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function parseCookieValue(cookieName: string): string | null {
  const cookiePairs = document.cookie.split(";").map((item) => item.trim());
  for (const item of cookiePairs) {
    if (!item.startsWith(`${cookieName}=`)) {
      continue;
    }
    const rawValue = item.slice(cookieName.length + 1);
    if (!rawValue) {
      return null;
    }
    return decodeURIComponent(rawValue);
  }
  return null;
}

export function readAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return parseCookieValue(ACCESS_TOKEN_KEY);
}

export function writeAccessToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ACCESS_TOKEN_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ACCESS_TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function readRefreshToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return parseCookieValue(REFRESH_TOKEN_KEY);
}

export function writeRefreshToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${REFRESH_TOKEN_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=${REFRESH_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function clearRefreshToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${REFRESH_TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
