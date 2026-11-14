import { settingsInput } from "../../lib/business-settings";
import { DEFAULT_THEME_TOKENS, normalizedThemeTokens } from "../../lib/theme-revisions";
import type { ThemeTokens } from "../../lib/theme-revisions";
export type BusinessFields = { display_name: string; timezone: string; default_locale: string; default_currency: string };
export type { ThemeTokens } from "../../lib/theme-revisions";
export type ReviewDraft = { business: BusinessFields; theme: ThemeTokens; step: "business" | "brand" | "review" };
export const typography = { system: "system-ui, sans-serif", serif: "Georgia, serif" } as const;
export function validBusiness(business: BusinessFields) {
  return settingsInput({ expected_revision: 0, settings: business }) !== null;
}
export function validTheme(value: unknown): value is ThemeTokens {
  return normalizedThemeTokens(value) !== null;
}
/** Unsaved editing state is not a Theme, Revision, Tenant or second onboarding DB. */
export function emptyReviewDraft(): ReviewDraft {
  return { business: { display_name: "", timezone: "Africa/Johannesburg", default_locale: "en-ZA", default_currency: "ZAR" },
    theme: { ...DEFAULT_THEME_TOKENS }, step: "business" };
}
export function advanceReview(draft: ReviewDraft): ReviewDraft {
  if (!validBusiness(draft.business) || (draft.step !== "business" && !validTheme(draft.theme))) return draft;
  return { ...draft, step: draft.step === "business" ? "brand" : "review" };
}
