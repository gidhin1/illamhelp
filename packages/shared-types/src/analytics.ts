export type AnalyticsSurface = "web" | "mobile" | "server";

export type AnalyticsConsentStatus = "granted" | "denied";

export type AnalyticsEventName =
  | "landing_viewed"
  | "page_viewed"
  | "signup_started"
  | "signup_completed"
  | "login_completed"
  | "legal_consent_updated"
  | "profile_updated"
  | "profile_media_uploaded"
  | "job_created"
  | "job_media_uploaded"
  | "job_applied"
  | "connection_requested"
  | "connection_accepted"
  | "consent_requested"
  | "consent_granted"
  | "consent_revoked"
  | "verification_started"
  | "verification_submitted"
  | "provider_verified"
  | "help_topic_viewed"
  | "faq_viewed"
  | "legal_document_viewed";

export interface AnalyticsConsentChoice {
  analytics: AnalyticsConsentStatus;
  ads: AnalyticsConsentStatus;
  updatedAt: string;
}

export interface AnalyticsBaseParams {
  surface: AnalyticsSurface;
  route?: string;
  schema_version?: "v1";
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

export type AnalyticsParamsByEvent = {
  landing_viewed: AnalyticsBaseParams & { surface: "web" | "mobile"; route: string };
  page_viewed: AnalyticsBaseParams & { surface: "web" | "mobile"; route: string };
  signup_started: AnalyticsBaseParams & { surface: "web" | "mobile"; source: string };
  signup_completed: AnalyticsBaseParams & { surface: "web" | "mobile"; method: string; user_type: string };
  login_completed: AnalyticsBaseParams & { surface: "web" | "mobile"; method: string };
  legal_consent_updated: AnalyticsBaseParams & {
    surface: "web" | "mobile";
    analytics_consent: AnalyticsConsentStatus;
    ad_consent: AnalyticsConsentStatus;
  };
  profile_updated: AnalyticsBaseParams & { surface: "web" | "mobile"; fields_changed_count: number };
  profile_media_uploaded: AnalyticsBaseParams & {
    surface: "web" | "mobile";
    media_kind: "image" | "video" | "mixed";
    media_count: number;
  };
  job_created: AnalyticsBaseParams & { surface: "web" | "mobile"; category: string; visibility: string };
  job_media_uploaded: AnalyticsBaseParams & {
    surface: "web" | "mobile";
    media_kind: "image" | "video" | "mixed";
    media_count: number;
  };
  job_applied: AnalyticsBaseParams & { surface: "web" | "mobile"; category?: string };
  connection_requested: AnalyticsBaseParams & { surface: "web" | "mobile"; source: string };
  connection_accepted: AnalyticsBaseParams & { surface: "web" | "mobile" };
  consent_requested: AnalyticsBaseParams & { surface: "web" | "mobile"; field_count: number };
  consent_granted: AnalyticsBaseParams & { surface: "web" | "mobile"; field_count: number };
  consent_revoked: AnalyticsBaseParams & { surface: "web" | "mobile" };
  verification_started: AnalyticsBaseParams & { surface: "web" | "mobile"; document_type: string };
  verification_submitted: AnalyticsBaseParams & {
    surface: "web" | "mobile";
    document_type: string;
    document_count: number;
  };
  provider_verified: AnalyticsBaseParams & {
    surface: "server";
    verification_request_id: string;
  };
  help_topic_viewed: AnalyticsBaseParams & { surface: "web" | "mobile"; topic_name: string };
  faq_viewed: AnalyticsBaseParams & { surface: "web" | "mobile"; question: string };
  legal_document_viewed: AnalyticsBaseParams & {
    surface: "web" | "mobile";
    document_type: "privacy_policy" | "terms";
    version: string;
  };
};

export type AnalyticsEventPayload<TName extends AnalyticsEventName = AnalyticsEventName> = {
  [Name in AnalyticsEventName]: {
    event: Name;
    params: AnalyticsParamsByEvent[Name];
  };
}[TName];
