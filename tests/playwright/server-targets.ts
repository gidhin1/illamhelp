import { spawnSync } from "node:child_process";

function isUrlReachable(url: string): boolean {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
const url = process.argv[1];
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 1000);

fetch(url, { signal: controller.signal })
  .then((response) => {
    clearTimeout(timeout);
    process.exit(response.ok ? 0 : 1);
  })
  .catch(() => process.exit(1));
      `,
      url
    ],
    {
      stdio: "ignore"
    }
  );

  return result.status === 0;
}

export function pickBaseUrl(envValue: string | undefined, existingUrl: string, fallbackUrl: string): {
  baseUrl: string;
  reuseExistingServer: boolean;
} {
  if (envValue && envValue.trim().length > 0) {
    return {
      baseUrl: envValue,
      reuseExistingServer: isUrlReachable(envValue)
    };
  }

  if (isUrlReachable(existingUrl)) {
    return {
      baseUrl: existingUrl,
      reuseExistingServer: true
    };
  }

  return {
    baseUrl: fallbackUrl,
    reuseExistingServer: false
  };
}

export function pickServerTarget(
  envValue: string | undefined,
  existingBaseUrl: string,
  fallbackBaseUrl: string
): {
  baseUrl: string;
  healthUrl: string;
  reuseExistingServer: boolean;
} {
  const healthUrlFor = (baseUrl: string): string => `${baseUrl.replace(/\/$/, "")}/api/v1/health`;

  if (envValue && envValue.trim().length > 0) {
    const baseUrl = envValue.trim().replace(/\/api\/v1\/health$/, "").replace(/\/api\/v1$/, "");
    return {
      baseUrl,
      healthUrl: healthUrlFor(baseUrl),
      reuseExistingServer: isUrlReachable(healthUrlFor(baseUrl))
    };
  }

  if (isUrlReachable(healthUrlFor(existingBaseUrl))) {
    return {
      baseUrl: existingBaseUrl,
      healthUrl: healthUrlFor(existingBaseUrl),
      reuseExistingServer: true
    };
  }

  return {
    baseUrl: fallbackBaseUrl,
    healthUrl: healthUrlFor(fallbackBaseUrl),
    reuseExistingServer: false
  };
}
