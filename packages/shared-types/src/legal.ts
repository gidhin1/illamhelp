export type LegalDocumentType = "privacy_policy" | "terms";

export type LegalSection = {
  title: string;
  body: string[];
};

export type FaqEntry = {
  question: string;
  answer: string;
};

export type HelpTopic = {
  title: string;
  humanIdentity: string;
  privacyState: string;
  nextSafeAction: string;
};

export const CURRENT_LEGAL_VERSIONS = {
  privacyPolicy: "2026-06-14",
  terms: "2026-06-14",
  effectiveDate: "2026-06-14",
  lastUpdatedDate: "2026-06-14"
} as const;

export const LEGAL_CONTACT = {
  entityName: "IllamHelp India Private Limited (placeholder)",
  address: "Registered office address to be confirmed before publication",
  supportEmail: "support@illamhelp.example",
  grievanceEmail: "grievance@illamhelp.example",
  jurisdiction: "India",
  governingLaw: "Laws of India, with venue placeholder to be confirmed by counsel"
} as const;

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    title: "What this policy covers",
    body: [
      "This Privacy Policy explains how IllamHelp collects, uses, shares, protects, and retains information for household service discovery, profile verification, jobs, media, connections, notifications, and trust and safety operations.",
      "It is written for an India-first launch and includes DPDP-style consent and grievance concepts, plus additional rights language for users who expect access, correction, deletion, or portability support."
    ]
  },
  {
    title: "Information we collect",
    body: [
      "Account and identity information can include your username, name, email, phone number, role, login/session identifiers, and authentication data handled through our identity provider.",
      "Profile and service information can include city, area, service categories, rating summaries, public profile text, profile images, videos, job posts, applications, booking workflow status, and related job media.",
      "Private and sensitive information can include full contact fields, verification documents, government ID media, moderation notes, audit records, device/request metadata, rate-limit events, and support or grievance messages."
    ]
  },
  {
    title: "Privacy by default",
    body: [
      "Contact fields are hidden by default. Full phone, alternate phone, email, and full address can be shared only through server-side policy checks after an accepted connection and explicit owner consent.",
      "Verification documents and government ID media are private. They are never shown in profile, job, connection, or public discovery views.",
      "Profile and job images or videos are purpose-scoped. They become visible only when the current media rules allow it and only after required moderation approval."
    ]
  },
  {
    title: "How we use information",
    body: [
      "We use information to create and secure accounts, show profiles and jobs, support connections, process consent requests, verify members, moderate media, send notifications, prevent abuse, and maintain audit trails.",
      "We use Keycloak/OIDC for authentication, signed object-storage URLs for media handling, rate limits to reduce abuse, and audit logs for privacy, moderation, and safety accountability."
    ]
  },
  {
    title: "Sharing and disclosure",
    body: [
      "We show public profile and approved media only according to product visibility rules. We do not show full contact fields unless consent grants allow that specific viewer to see that specific field.",
      "Administrators and support users may access limited information for verification, moderation, safety, legal, or support purposes based on role-based controls and audit logging.",
      "We may share information with service providers that help operate the product, such as identity, infrastructure, storage, moderation, notification, analytics, or security providers, under appropriate operational controls."
    ]
  },
  {
    title: "User rights and choices",
    body: [
      "You can request access, correction, deletion or anonymization, and withdrawal of consent where applicable. Some records may be retained where required for fraud prevention, legal obligations, dispute handling, security, or audit integrity.",
      "You can revoke contact-sharing consent from the Privacy area. Revocation stops future access through the product immediately, subject to technical propagation and legally required records.",
      "For privacy requests or grievances, contact the support or grievance address listed on this page. Final legal entity and grievance officer details must be confirmed before production publication."
    ]
  },
  {
    title: "Retention and security",
    body: [
      "Retention is based on data class. Account, profile, job, verification, media, audit, and support records may have different retention windows, which remain placeholders until finalized by counsel and operations.",
      "Sensitive contact data is protected with server-side access checks and encryption-at-rest patterns. Media downloads use signed links, and public media should have unnecessary metadata stripped before publication.",
      "No system can promise perfect security. We use layered controls and ask users to keep passwords private, report suspicious activity, and avoid sharing sensitive information outside the intended product flows."
    ]
  }
];

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "Agreement to these terms",
    body: [
      "These Terms and Conditions govern your use of IllamHelp. By creating an account or using the service, you agree to the current Terms and Privacy Policy versions shown during registration.",
      "These terms are a production-ready draft for implementation and must be reviewed by qualified counsel before final publication."
    ]
  },
  {
    title: "Marketplace role",
    body: [
      "IllamHelp helps seekers and providers discover household service opportunities, review identity signals, manage privacy consent, upload service-related media, and coordinate next steps.",
      "IllamHelp does not promise employment, insurance, background-check completeness, payment completion, service quality, or dispute outcomes beyond the specific product features that are active in the app."
    ]
  },
  {
    title: "Accounts and eligibility",
    body: [
      "You are responsible for the accuracy of your account, profile, service, and job information and for keeping your credentials secure.",
      "Providers may need verification before accepting or performing certain jobs. Admin or support teams may review documents, media, reports, and audit records for safety and compliance."
    ]
  },
  {
    title: "Acceptable use",
    body: [
      "You must not post illegal, misleading, abusive, harassing, discriminatory, explicit, unsafe, spammy, or unrelated content.",
      "You must not bypass privacy controls, scrape user data, pressure users to share contact details early, upload contact-spam overlays, misuse verification documents, or attempt unauthorized access."
    ]
  },
  {
    title: "Jobs, connections, and contact sharing",
    body: [
      "Job posts, applications, booking actions, and cancellations must be honest and service-related. Users should review identity, privacy state, and next safe action before meeting or sharing details.",
      "Full contact information is owner-controlled. An accepted connection alone does not grant full contact access; the owner must explicitly approve the requested fields and may revoke access."
    ]
  },
  {
    title: "Media and verification",
    body: [
      "Images and videos must be professional, service-relevant, and safe. Media may be scanned, moderated, approved, rejected, or removed under the media policy.",
      "Verification documents and government IDs are private and may be used only for verification, legal, safety, fraud, or support workflows."
    ]
  },
  {
    title: "Suspension, disclaimers, and disputes",
    body: [
      "IllamHelp may limit, suspend, or remove accounts, jobs, media, or access where there is policy abuse, safety risk, legal risk, fraud, or operational need.",
      "The service is provided on an as-is and as-available basis to the extent permitted by law. Liability, indemnity, venue, and dispute terms remain placeholders for counsel to finalize under Indian law."
    ]
  }
];

export const HELP_TOPICS: HelpTopic[] = [
  {
    title: "Create an account",
    humanIdentity: "Use your real name details and a public user ID that other members can recognize.",
    privacyState: "Your contact details stay protected by default after registration.",
    nextSafeAction: "Accept the current Terms and Privacy Policy, then complete your profile before sharing contact information."
  },
  {
    title: "Set up your profile and media",
    humanIdentity: "Profile details and media help other members understand who you are and what work you do.",
    privacyState: "Profile media follows profile visibility rules; verification documents never belong in profile media.",
    nextSafeAction: "Upload profile photos or videos only from the Profile page and wait for moderation approval."
  },
  {
    title: "Use job media",
    humanIdentity: "Job photos and videos should explain the work context, progress, or result.",
    privacyState: "Job media follows job visibility and moderation rules.",
    nextSafeAction: "Attach service-relevant images or videos from the job flow and avoid contact details inside the media."
  },
  {
    title: "Find people and open Discover",
    humanIdentity: "Search results show member cards and visible profile context.",
    privacyState: "Discover shows only details allowed by profile, connection, media, and consent rules.",
    nextSafeAction: "Open Discover to view the profile, then request connection or contact access only when needed."
  },
  {
    title: "Control contact sharing",
    humanIdentity: "Consent is always tied to a specific person and purpose.",
    privacyState: "You can grant selected contact fields and revoke active grants later.",
    nextSafeAction: "Open Privacy to review active sharing, incoming requests, history, and revocation actions."
  },
  {
    title: "Handle verification and moderation",
    humanIdentity: "Verification helps establish trust, while moderation keeps profile and job media service-related.",
    privacyState: "ID documents stay private; rejected media remains private unless an allowed appeal path changes the decision.",
    nextSafeAction: "Use Verification for ID documents and Help/Support for review questions or safety concerns."
  }
];

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    question: "Can other users see my phone number or address?",
    answer: "No. Full contact fields are hidden by default and require accepted connection plus your explicit consent for the specific fields requested."
  },
  {
    question: "Are my ID documents visible on my profile?",
    answer: "No. Verification documents and government IDs are private and are never returned in profile, job, connection, or public media views."
  },
  {
    question: "Why is my photo or video not visible yet?",
    answer: "Uploaded media must be service-relevant and approved by moderation before it appears in shared or public views."
  },
  {
    question: "What happens when I revoke contact sharing?",
    answer: "Future product responses stop showing the revoked fields to that person. Audit records may remain for safety, legal, and compliance purposes."
  },
  {
    question: "How do I report a safety or privacy issue?",
    answer: "Use the support contact listed in Help or the grievance contact listed in the Privacy Policy. Include the member, job, media, or request context if available."
  },
  {
    question: "Can I delete or correct my account data?",
    answer: "You can request correction, deletion, or anonymization. Some records may be retained where needed for legal obligations, fraud prevention, disputes, security, or audit integrity."
  }
];
