export const applicationMessageHint =
  "Leave the message blank, or enter 4 to 500 characters about how you can help.";

export function validateApplicationMessage(message: string): string | null {
  const length = message.trim().length;
  if (length > 500) return "Shorten your message to 500 characters or fewer.";
  if (length > 0 && length < 4) return "Enter at least 4 characters, or leave the message blank.";
  return null;
}
