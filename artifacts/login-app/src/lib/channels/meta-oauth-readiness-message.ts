/**
 * Human-readable OAuth readiness copy for Messenger / Instagram settings.
 * Never includes secret values — only reason codes and env var *names*.
 */

export type MetaOauthReadinessLike = {
  ready: boolean;
  reason: string | null;
  missingConfigKeys?: string[];
  redirectUri?: string | null;
};

/** Exact production Messenger callback Meta must whitelist (Valid OAuth Redirect URIs). */
export const VALUEOR_MESSENGER_OAUTH_REDIRECT_URI =
  "https://api.valueor.org/api/oauth/messenger/callback";

export function formatMetaOauthReadinessMessage(
  readiness: MetaOauthReadinessLike | null | undefined,
  channel: "messenger" | "instagram",
): string | null {
  if (!readiness || readiness.ready) return null;

  const reason = String(readiness.reason ?? "").trim() || "unknown";
  const missing = (readiness.missingConfigKeys ?? []).map((k) => String(k).trim()).filter(Boolean);

  if (
    (reason === "MSL_META_CONFIG_MISSING" || reason === "IGL_META_CONFIG_MISSING") &&
    missing.length > 0
  ) {
    const label = channel === "messenger" ? "Messenger" : "Instagram";
    return (
      `${label} Connect is disabled until Meta App credentials are set: ` +
      `${missing.join(", ")}. ` +
      `For production, set GitHub Production secrets / Contabo overlay, then redeploy.`
    );
  }

  if (reason === "MSL_COMPANY_NOT_ALLOWED" || reason === "IGL_COMPANY_NOT_ALLOWED") {
    return "This company is not on the OAuth allowlist (META_*_ALLOWED_COMPANY_IDS).";
  }

  if (reason === "MSL_DISABLED" || reason === "IGL_DISABLED") {
    return "Self-service OAuth is disabled by server feature flags.";
  }

  return `Self-service not ready (${reason}).`;
}

/**
 * When Meta shows "URL blocked", the Facebook Login app is missing this exact redirect URI.
 * Safe to show — public callback URL, never secrets.
 */
export function formatMessengerRedirectUriHint(
  readiness: MetaOauthReadinessLike | null | undefined,
): string {
  const uri =
    String(readiness?.redirectUri ?? "").trim() || VALUEOR_MESSENGER_OAUTH_REDIRECT_URI;
  return (
    `If Meta shows "URL blocked", open Meta App → Facebook Login → Settings → Valid OAuth Redirect URIs ` +
    `and add exactly: ${uri}`
  );
}
