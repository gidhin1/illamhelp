const pendingLabels: Record<string, string> = {
  uploaded: "Waiting for checks",
  scanning: "Checking upload",
  ai_reviewed: "Waiting for review",
  human_review_pending: "Waiting for review",
  appeal_pending: "Review requested"
};

export function pendingMediaReviewLabel(state: string): string {
  return pendingLabels[state] ?? "Waiting for review";
}

export const mediaAppealReceipt = "Review requested. Your upload stays hidden while we review it.";
export const mediaAppealError = "We couldn’t request a review. Try again.";
