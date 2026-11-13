import { settingsInput } from "../../lib/business-settings";
export type BusinessFields = { display_name: string; timezone: string; default_locale: string; default_currency: string };
export type ThemeTokens = { primary: string; accent: string; typography: "system" | "serif" };
export type ReviewDraft = { business: BusinessFields; theme: ThemeTokens; step: "business" | "brand" | "review" };
export const typography = { system: "system-ui, sans-serif", serif: "Georgia, serif" } as const;
export function validBusiness(business: BusinessFields) {
  return settingsInput({ expected_revision: 0, settings: business }) !== null;
}
export function validTheme(value: unknown): value is ThemeTokens {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const t = value as Record<string, unknown>;
  return Object.keys(t).length === 3 && typeof t.primary === "string" && /^#[0-9a-f]{6}$/i.test(t.primary)
    && typeof t.accent === "string" && /^#[0-9a-f]{6}$/i.test(t.accent) && (t.typography === "system" || t.typography === "serif");
}
/** Unsaved editing state is not a Theme, Revision, Tenant or second onboarding DB. */
export function emptyReviewDraft(): ReviewDraft {
  return { business: { display_name: "", timezone: "Africa/Johannesburg", default_locale: "en-ZA", default_currency: "ZAR" },
    theme: { primary: "#244b42", accent: "#d8e9d9", typography: "system" }, step: "business" };
}
export function advanceReview(draft: ReviewDraft): ReviewDraft {
  if (!validBusiness(draft.business) || (draft.step !== "business" && !validTheme(draft.theme))) return draft;
  return { ...draft, step: draft.step === "business" ? "brand" : "review" };
}
