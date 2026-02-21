export type UserRole = "seeker" | "provider" | "admin" | "support";

export type ConnectionStatus = "pending" | "accepted" | "declined" | "blocked";

export type ConsentField =
  | "phone"
  | "alternate_phone"
  | "email"
  | "full_address";

export type ConsentGrantStatus = "active" | "revoked";

export type MediaKind = "image" | "video";

export type MediaState =
  | "uploaded"
  | "scanning"
  | "ai_reviewed"
  | "human_review_pending"
  | "approved"
  | "rejected"
  | "appeal_pending"
  | "appeal_resolved";
