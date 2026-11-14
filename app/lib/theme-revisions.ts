/** V1's allowlisted appearance controls. Never accept arbitrary tenant CSS. */
export type ThemeTokens = { primary: string; accent: string; typography: "system" | "serif" };
export const DEFAULT_THEME_TOKENS: ThemeTokens = { primary: "#244b42", accent: "#d8e9d9", typography: "system" };
export type ThemeHistory = { revision: number; revision_id: string; created_at: string };
export type ThemeRecord = { theme_id: string; name: string; current_revision: number; tokens: ThemeTokens; history: ThemeHistory[] };
export type ThemeSummary = { theme_id: string; name: string; status: "ACTIVE" | "ARCHIVED"; current_revision: number };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const revision = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value)
  && value >= 1 && value <= 2147483647;

export function normalizedThemeTokens(value: unknown): ThemeTokens | null {
  if (!record(value) || Object.keys(value).length !== 3 ||
    typeof value.primary !== "string" || !/^#[0-9a-f]{6}$/i.test(value.primary) ||
    typeof value.accent !== "string" || !/^#[0-9a-f]{6}$/i.test(value.accent) ||
    (value.typography !== "system" && value.typography !== "serif")) return null;
  return { primary: value.primary.toLowerCase(), accent: value.accent.toLowerCase(), typography: value.typography };
}

function themeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").replace(/^ +| +$/g, "");
  if (!name || [...name].length > 80 || /[\p{Cc}\p{Cs}\p{Bidi_Control}\u2028\u2029<>{}]/u.test(name)
    || /^\p{White_Space}|\p{White_Space}$/u.test(name)) return null;
  return name;
}

export function newThemeInput(value: unknown): { theme_name: string; design_tokens: ThemeTokens } | null {
  if (!record(value) || Object.keys(value).length !== 2 || !("name" in value) || !("tokens" in value)) return null;
  const name = themeName(value.name), tokens = normalizedThemeTokens(value.tokens);
  return name && tokens ? { theme_name: name, design_tokens: tokens } : null;
}

export function savedThemeInput(value: unknown): { expected: number; design_tokens: ThemeTokens } | null {
  if (!record(value) || Object.keys(value).length !== 2 || !("expected_revision" in value) || !("tokens" in value)
    || !revision(value.expected_revision) || value.expected_revision > 2147483646) return null;
  const tokens = normalizedThemeTokens(value.tokens);
  return tokens ? { expected: value.expected_revision, design_tokens: tokens } : null;
}

export function themeRecord(value: unknown): value is ThemeRecord {
  return record(value) && Object.keys(value).length === 5 && uuid(value.theme_id)
    && themeName(value.name) === value.name && revision(value.current_revision)
    && normalizedThemeTokens(value.tokens) !== null && Array.isArray(value.history) && value.history.length > 0
    && value.history.every((entry: unknown) => record(entry) && Object.keys(entry).length === 3 && revision(entry.revision)
      && uuid(entry.revision_id) && typeof entry.created_at === "string");
}

export function themeSummaries(value: unknown): value is { themes: ThemeSummary[] } {
  return record(value) && Object.keys(value).length === 1 && Array.isArray(value.themes)
    && value.themes.every((entry: unknown) => record(entry) && Object.keys(entry).length === 4 && uuid(entry.theme_id)
      && themeName(entry.name) === entry.name && (entry.status === "ACTIVE" || entry.status === "ARCHIVED")
      && revision(entry.current_revision));
}

export function themeVersion(value: unknown): value is { theme_id: string; revision: number; tokens: ThemeTokens; revision_id: string; created_at: string } {
  return record(value) && Object.keys(value).length === 5 && uuid(value.theme_id)
    && uuid(value.revision_id) && revision(value.revision)
    && normalizedThemeTokens(value.tokens) !== null && typeof value.created_at === "string";
}
