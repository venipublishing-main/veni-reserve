/** Logical product routes, independent of the eventual public host. */
export const workspacePaths = ["/app", "/app/onboarding", "/app/customize", "/app/settings"] as const;
export function safeReturnPath(value: unknown): string {
  // Exact allowlist: no origins, queries, fragments, encoded paths or tenant claims.
  return typeof value === "string" && workspacePaths.some(path => path === value) ? value : "/app";
}
export function accountEntry(kind: "signup" | "login", next = "/app") {
  return `/${kind}?next=${encodeURIComponent(safeReturnPath(next))}`;
}
export const setupSteps = ["Business", "Brand", "Services", "Staff", "Availability", "Calendar (optional)", "Communications (optional)", "Review", "Publish"] as const;
