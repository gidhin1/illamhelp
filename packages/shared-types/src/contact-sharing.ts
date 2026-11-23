export function contactShareStatus(
  share: { status: string; expiresAt?: string | null },
  now: number
): string {
  if (share.status !== "active" || !share.expiresAt) return share.status;

  // The grants endpoint can return PostgreSQL's timestamp spelling with a short UTC offset.
  const datePart = share.expiresAt.replace(" ", "T");
  const offset = datePart.slice(10).match(/[+-]\d{2}$/)?.[0];
  const expiry = Date.parse(offset ? `${datePart}:00` : datePart);
  return Number.isFinite(expiry) && expiry <= now ? "expired" : share.status;
}

export function validateStopSharingReason(reason: string): string | null {
  return reason.trim().length >= 3 ? null : "Enter a reason with at least 3 characters.";
}
