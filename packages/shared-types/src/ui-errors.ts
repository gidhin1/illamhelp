const nextSteps: Readonly<Record<string, string>> = {
  "Invalid credentials": "Check your username or email and password, then try again.",
  "Too many authentication attempts. Try again shortly.": "Too many sign-in attempts. Wait a moment and try again.",
  "Accepted connection is required to view profile media": "Connect with this member to see their approved photos and videos.",
  "Mutual accepted connection is required before PII access request": "Connect with this person before requesting their contact details.",
  "Access request is no longer pending or an active consent grant already exists.": "This request may already be resolved or the details may already be shared. Refresh your sharing list.",
  "You cannot view media for this job": "You don’t have access to these job photos or videos.",
  "You cannot attach media to this job": "You don’t have permission to add photos or videos to this job.",
  "Failed to verify uploaded object in storage": "We couldn’t confirm your upload. Choose the file and try again."
};

export function formatUiError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message.trim()) return fallback;

  const message = error.message.trim();
  if (/^(?:failed to fetch|load failed|network ?error|network request failed|request timed out|internal server error|request failed (?:with )?5\d\d\b)/i.test(message)) {
    return fallback;
  }
  return Object.hasOwn(nextSteps, message) ? nextSteps[message] : message;
}
