/** Pure expiry policy for API Bearer tokens (no Supabase import). */

/** Default skew: refresh if token expires within this window. */
export const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

export function accessTokenNeedsRefresh(
  expiresAtSeconds: number | null | undefined,
  nowMs: number = Date.now(),
  skewMs: number = ACCESS_TOKEN_REFRESH_SKEW_MS,
): boolean {
  if (expiresAtSeconds == null || !Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) {
    return true;
  }
  return expiresAtSeconds * 1000 <= nowMs + skewMs;
}
