import type { JobDto } from "./index";

export type BookingAction = "start" | "complete" | "payment-done" | "payment-received" | "close" | "cancel" | "revoke";

export const bookingActions = {
  start: { label: "Start job", success: "Job started." },
  complete: { label: "Mark work complete", success: "Work marked complete." },
  "payment-done": { label: "Mark as paid", success: "Payment marked as paid." },
  "payment-received": { label: "Confirm payment received", success: "Payment marked as received." },
  close: { label: "Close job", success: "Job closed." },
  cancel: { label: "Cancel booking", success: "Booking cancelled." },
  revoke: { label: "Revoke assignment", success: "Assignment revoked." }
} satisfies Record<BookingAction, { label: string; success: string }>;

const bookingProgress = {
  posted: { label: "Open for applications", next: "Assign an applicant to book this job." },
  accepted: { label: "Provider assigned", next: "The provider marks when work starts." },
  in_progress: { label: "Work in progress", next: "The job owner marks when work is finished." },
  completed: { label: "Work complete", next: "The job owner marks the payment after sending it." },
  payment_done: { label: "Payment reported", next: "The provider confirms when payment arrives." },
  payment_received: { label: "Payment received", next: "The job owner can close the booking." },
  closed: { label: "Booking closed", next: "Work and payment are complete." },
  cancelled: { label: "Booking cancelled", next: "This booking has ended." }
} satisfies Record<JobDto["status"], { label: string; next: string }>;

export function bookingControls(status: JobDto["status"], role: "owner" | "provider") {
  const owner = role === "owner";
  const ownerActions: Partial<Record<JobDto["status"], BookingAction>> = {
    in_progress: "complete", completed: "payment-done", payment_received: "close"
  };
  const providerActions: Partial<Record<JobDto["status"], BookingAction>> = {
    accepted: "start", payment_done: "payment-received"
  };
  const primary = (owner ? ownerActions : providerActions)[status];

  return {
    ...bookingProgress[status],
    primary,
    canCancel: status === "posted" || status === "accepted" || status === "in_progress",
    canRevoke: owner && status === "accepted"
  };
}

export const bookingConfirmation = {
  cancel: {
    prompt: "Cancel this booking? Work on this booking will end.",
    reason: "Cancel reason (optional)"
  },
  revoke: {
    prompt: "Revoke this assignment? The current provider will be removed and the job will reopen.",
    reason: "Assignment revoke reason (optional)"
  }
};
