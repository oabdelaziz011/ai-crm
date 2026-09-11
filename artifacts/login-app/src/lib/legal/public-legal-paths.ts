/** Public legal pages that must load without authentication. */
export const PUBLIC_LEGAL_PATHS = [
  "/privacy-policy",
  "/data-deletion",
  "/terms",
] as const;

export type PublicLegalPath = (typeof PUBLIC_LEGAL_PATHS)[number];

/** Effective date shown on privacy, terms, and data-deletion pages. */
export const LEGAL_POLICY_LAST_UPDATED = "2026-09-08";

export function normalizePublicPath(path: string): string {
  if (!path) return "/";
  const withoutQuery = path.split("?")[0]?.split("#")[0] ?? path;
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.replace(/\/+$/, "") || "/";
  }
  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}

export function isPublicLegalPath(path: string): boolean {
  const normalized = normalizePublicPath(path);
  return (PUBLIC_LEGAL_PATHS as readonly string[]).includes(normalized);
}
