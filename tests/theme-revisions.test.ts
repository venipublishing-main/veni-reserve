import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_THEME_TOKENS, newThemeInput, normalizedThemeTokens, savedThemeInput, themeRecord, themeSummaries, themeVersion } from "../app/lib/theme-revisions";
import { bookingTheme } from "../app/features/booking/theme";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const uuidA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", uuidB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("private Theme Revision V1 boundaries", () => {
  it("accepts only safe semantic appearance tokens and canonicalizes hex", () => {
    expect(normalizedThemeTokens({ ...DEFAULT_THEME_TOKENS, primary: "#ABCDEF" })).toEqual({ ...DEFAULT_THEME_TOKENS, primary: "#abcdef" });
    for (const candidate of [null, [], {}, { ...DEFAULT_THEME_TOKENS, css: "body{}" },
      { ...DEFAULT_THEME_TOKENS, primary: "#fff" }, { ...DEFAULT_THEME_TOKENS, accent: "red" },
      { ...DEFAULT_THEME_TOKENS, typography: "url(https://evil.invalid)" },
      { ...DEFAULT_THEME_TOKENS, logoUrl: "blob:local" }, { ...DEFAULT_THEME_TOKENS, primary: "#ffffff; background:url(x)" }]) {
      expect(normalizedThemeTokens(candidate)).toBeNull();
    }
    expect(JSON.stringify(bookingTheme("url(evil)"))).not.toContain("url(evil)");
  });
  it("bounds names, scalar revisions, and exact request keys", () => {
    expect(newThemeInput({ name: " Standard ", tokens: DEFAULT_THEME_TOKENS })).toEqual({ theme_name: "Standard", design_tokens: DEFAULT_THEME_TOKENS });
    for (const name of ["", " ", "x".repeat(81), "<img>", "\u202eABC", "{unsafe}", "\u00a0name"]) {
      expect(newThemeInput({ name, tokens: DEFAULT_THEME_TOKENS })).toBeNull();
    }
    expect(newThemeInput({ name: "Standard", tokens: DEFAULT_THEME_TOKENS, tenant_id: uuidA })).toBeNull();
    expect(savedThemeInput({ expected_revision: 1, tokens: DEFAULT_THEME_TOKENS })).toEqual({ expected: 1, design_tokens: DEFAULT_THEME_TOKENS });
    for (const expected_revision of [0, -1, 2.5, "2", null, 2147483647])
      expect(savedThemeInput({ expected_revision, tokens: DEFAULT_THEME_TOKENS })).toBeNull();
    expect(savedThemeInput({ expected_revision: 1, tokens: DEFAULT_THEME_TOKENS, actor_user_id: uuidB })).toBeNull();
  });
  it("validates the small database output contract before returning it to a browser", () => {
    const history = [{ revision: 1, revision_id: uuidB, created_at: "2026-11-14T00:00:00Z" }];
    expect(themeRecord({ theme_id: uuidA, name: "Standard", current_revision: 1, tokens: DEFAULT_THEME_TOKENS, history })).toBe(true);
    expect(themeRecord({ theme_id: uuidA, name: "Standard", current_revision: 1, tokens: { ...DEFAULT_THEME_TOKENS, script: "alert(1)" }, history })).toBe(false);
    expect(themeSummaries({ themes: [{ theme_id: uuidA, name: "Standard", current_revision: 1, status: "ACTIVE" }] })).toBe(true);
    expect(themeSummaries({ themes: [{ theme_id: "other", name: "Standard", current_revision: 1, status: "ACTIVE" }] })).toBe(false);
    expect(themeVersion({ theme_id: uuidA, revision: 1, revision_id: uuidB, created_at: "2026-11-14T00:00:00Z", tokens: DEFAULT_THEME_TOKENS })).toBe(true);
  });
  it("does not create a public Theme route or silently expose publish/asset persistence", () => {
    const routes = read("app/routes.ts"), harness = read("local/tenant-harness.ts"), migration = read("supabase/migrations/20261114110626_theme_revisions_private_drafts.sql");
    expect(routes).not.toMatch(/route\([^\n]*themes/);
    expect(harness).toContain('create_tenant_theme');
    expect(migration).toContain("alter table private.published_theme_assignments enable row level security");
    expect(migration).not.toMatch(/create function public\.publish|grant (insert|update) on private\.published_theme_assignments/i);
    expect(migration).toContain("revoke veni_theme_executor from postgres");
    expect(read("app/features/site/local-theme-studio.tsx")).toContain("Publish — separate authorisation required");
  });
});
