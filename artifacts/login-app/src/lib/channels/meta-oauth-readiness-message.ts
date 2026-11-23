/**
 * Human-readable OAuth readiness copy for Messenger / Instagram settings.
 * Never includes secret values — only reason codes and env var *names*.
 */

export type MetaOauthReadinessLike = {
  ready: boolean;
  reason: string | null;
  missingConfigKeys?: string[];
};

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
      `${label} Connect is disabled until Development Meta App credentials are set in local env: ` +
      `${missing.join(", ")}. ` +
      `Add them to .env.localstack or .env.local.integration, then restart the local API.`
    );
  }

  if (reason === "MSL_COMPANY_NOT_ALLOWED" || reason === "IGL_COMPANY_NOT_ALLOWED") {
    return "This company is not on the local OAuth allowlist (META_*_ALLOWED_COMPANY_IDS).";
  }

  if (reason === "MSL_DISABLED" || reason === "IGL_DISABLED") {
    return "Self-service OAuth is disabled by server feature flags.";
  }

  return `Self-service not ready (${reason}).`;
}
