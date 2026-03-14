import { ConsentField } from "./api";
export const CONSENT_FIELD_LABELS: Record<ConsentField, string> = {
  phone: "Phone number",
  alternate_phone: "Alternate phone",
  email: "Email address",
  full_address: "Home address"
};

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  job_application_received: "Application",
  job_application_accepted: "Accepted",
  job_application_rejected: "Rejected",
  job_booking_started: "Job started",
  job_booking_completed: "Job completed",
  job_booking_cancelled: "Job cancelled",
  connection_request_received: "Connection request",
  connection_request_accepted: "Connected",
  connection_request_declined: "Connection declined",
  verification_approved: "Verification approved",
  verification_rejected: "Verification rejected",
  consent_grant_received: "Privacy grant",
  consent_grant_revoked: "Privacy revoked",
  media_approved: "Media approved",
  media_rejected: "Media rejected",
  system_announcement: "Announcement"
};

export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pending review",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected"
};

export const MAX_RENDER_ROWS = 30;
