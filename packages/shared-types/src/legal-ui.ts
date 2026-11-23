import type { FaqEntry, LegalSection } from "./legal";

export const legalPages = {
  help: { href: "/help", label: "Help", title: "Help center", description: "Find the right screen, read answers, or look up support details." },
  faq: { href: "/faq", label: "FAQ", title: "Frequently asked questions", description: "Search for answers about your account, privacy, and verification." },
  terms: { href: "/terms", label: "Terms", title: "Terms and Conditions", description: "The rules for using IllamHelp to post jobs, find work, and connect with members." },
  privacy: { href: "/privacy-policy", label: "Privacy Policy", title: "Privacy Policy", description: "How IllamHelp handles your account, contact details, documents, and activity." }
} as const;

export type LegalPageKey = keyof typeof legalPages;

export const helpShortcuts = [
  { route: "privacy", href: "/consent", label: "Manage contact sharing", detail: "Choose who can see your contact details and stop sharing when needed." },
  { route: "verify", href: "/verification", label: "Check verification", detail: "Upload a private document or check the review outcome." },
  { route: "jobs-discover", href: "/jobs/discover", label: "Browse jobs", detail: "Find work and open the photos or videos you can view." },
  { route: "profile", href: "/profile", label: "Edit your profile", detail: "Update your details, services, and work samples." }
] as const;

export function legalSectionId(section: LegalSection): string {
  return section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function filterFaqEntries(entries: readonly FaqEntry[], query: string): readonly FaqEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? entries.filter(({ question, answer }) => {
    const text = `${question} ${answer}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }) : entries;
}

export function canEmailLegalContact(address: string): boolean {
  const [local, domain, extra] = address.trim().toLowerCase().split("@");
  return !!local && !!domain && !extra && domain.includes(".") && !domain.endsWith(".example");
}
