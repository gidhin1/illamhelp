export const verificationDocumentTypes = [
  ["government_id", "Government ID"],
  ["professional_certification", "Professional certificate"],
  ["business_license", "Business licence"],
  ["utility_bill", "Utility bill"]
] as const;

const verificationStatuses = {
  pending: { label: "Pending review", tone: "warning", detail: "Your request is waiting for a reviewer." },
  under_review: { label: "Under review", tone: "info", detail: "A reviewer is checking your request." },
  approved: { label: "Approved", tone: "success", detail: "Your profile displays a verified badge." },
  rejected: { label: "Needs changes", tone: "error", detail: "Read the review feedback before resubmitting." }
} as const;

export function verificationStatus(status: string) {
  return Object.prototype.hasOwnProperty.call(verificationStatuses, status)
    ? verificationStatuses[status as keyof typeof verificationStatuses]
    : { label: status, tone: "info" as const, detail: "Refresh to check for updates." };
}

export function verificationDocumentLabel(type: string): string {
  return verificationDocumentTypes.find(([value]) => value === type)?.[1] ?? type.replaceAll("_", " ");
}

export function readyVerificationDocuments<T extends { state: string; purpose: string; createdAt: string }>(
  media: T[],
  rejectedRequestCreatedAt?: string
): T[] {
  return media.filter((file) =>
    file.purpose === "verification_document" &&
    file.state !== "uploaded" && file.state !== "rejected" &&
    (!rejectedRequestCreatedAt || Date.parse(file.createdAt) > Date.parse(rejectedRequestCreatedAt))
  );
}

export const verificationPrivacy = "Your documents are visible only to you and verification reviewers.";
