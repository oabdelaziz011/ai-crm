/**
 * Shared Meta OAuth company allowlist parsing.
 *
 * Deny-by-default:
 * - empty / missing / whitespace-only → deny all
 * - explicit company UUIDs → only those IDs
 * - explicit `*` sentinel → public-all (OAuth company gate only; enablement,
 *   auth, company scope, and commercial entitlements remain separate gates)
 *
 * Never fail-open on unrecognized tokens.
 */

export const META_OAUTH_PUBLIC_ALL_SENTINEL = "*";

const COMPANY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MetaOauthCompanyAllowlist =
  | { mode: "deny_all"; ids: ReadonlySet<string> }
  | { mode: "public_all"; ids: ReadonlySet<string> }
  | { mode: "explicit"; ids: ReadonlySet<string> };

export function normalizeMetaOauthCompanyId(companyId: unknown): string {
  return String(companyId ?? "")
    .trim()
    .toLowerCase();
}

export function isMetaOauthCompanyUuid(companyId: unknown): boolean {
  return COMPANY_UUID_RE.test(normalizeMetaOauthCompanyId(companyId));
}

/**
 * Parse a raw allowlist env value.
 * `*` (alone or among comma/space-separated tokens) enables public-all mode.
 * UUID tokens are collected for explicit mode; non-UUID tokens (except `*`) are ignored.
 */
export function parseMetaOauthCompanyAllowlist(
  raw: unknown,
): MetaOauthCompanyAllowlist {
  const text = String(raw ?? "").trim();
  if (!text) {
    return { mode: "deny_all", ids: new Set() };
  }

  const ids = new Set<string>();
  let publicAll = false;
  for (const part of text.split(/[,;\s]+/)) {
    const token = part.trim();
    if (!token) continue;
    if (token === META_OAUTH_PUBLIC_ALL_SENTINEL) {
      publicAll = true;
      continue;
    }
    const id = normalizeMetaOauthCompanyId(token);
    if (COMPANY_UUID_RE.test(id)) ids.add(id);
  }

  if (publicAll) {
    return { mode: "public_all", ids };
  }
  if (ids.size === 0) {
    return { mode: "deny_all", ids };
  }
  return { mode: "explicit", ids };
}

/** True when this allowlist entry alone would admit any valid company UUID. */
export function isMetaOauthPublicAllAllowlist(raw: unknown): boolean {
  return parseMetaOauthCompanyAllowlist(raw).mode === "public_all";
}

/**
 * Evaluate company membership against a single allowlist raw value.
 * Does not consult enablement flags or commercial entitlements.
 */
export function isCompanyAllowedByMetaOauthAllowlist(
  companyId: unknown,
  raw: unknown,
): boolean {
  const id = normalizeMetaOauthCompanyId(companyId);
  if (!COMPANY_UUID_RE.test(id)) return false;
  const parsed = parseMetaOauthCompanyAllowlist(raw);
  if (parsed.mode === "public_all") return true;
  if (parsed.mode === "deny_all") return false;
  return parsed.ids.has(id);
}

/**
 * Dedicated allowlist first; if empty/deny_all, fall back to Pages allowlist.
 * Explicit UUIDs or `*` on the dedicated list win and do not consult fallback.
 */
export function isCompanyAllowedByMetaOauthAllowlistChain(
  companyId: unknown,
  dedicatedRaw: unknown,
  fallbackRaw: unknown,
): boolean {
  const id = normalizeMetaOauthCompanyId(companyId);
  if (!COMPANY_UUID_RE.test(id)) return false;

  const dedicated = parseMetaOauthCompanyAllowlist(dedicatedRaw);
  if (dedicated.mode === "public_all") return true;
  if (dedicated.mode === "explicit") return dedicated.ids.has(id);

  // dedicated empty / deny_all → Pages fallback (also deny-by-default / * / UUIDs)
  const fallback = parseMetaOauthCompanyAllowlist(fallbackRaw);
  if (fallback.mode === "public_all") return true;
  if (fallback.mode === "deny_all") return false;
  return fallback.ids.has(id);
}
