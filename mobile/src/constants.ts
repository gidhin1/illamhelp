import { ConsentField } from "./api";
export const CONSENT_FIELD_LABELS: Record<ConsentField, string> = {
  phone: "Phone number",
  alternate_phone: "Alternate phone",
  email: "Email address",
  full_address: "Home address"
};

export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pending review",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected"
};

export const MAX_RENDER_ROWS = 30;
