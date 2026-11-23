import type { MetaConnectionStatus } from "./meta-instagram-login-client";

export const META_CONNECTION_STATUS_LABELS: Record<MetaConnectionStatus, string> = {
  connected: "Connected",
  not_connected: "Not Connected",
  connection_expired: "Connection Expired",
  reauthorization_required: "Reauthorization Required",
  webhook_subscription_failed: "Webhook Subscription Failed",
};

export function resolveMetaConnectionStatus(input: {
  enabled: boolean;
  hasAccessToken: boolean;
  healthOk?: boolean | null;
  tokenExpired?: boolean;
  webhookFailed?: boolean;
  stored?: MetaConnectionStatus | null;
}): MetaConnectionStatus {
  if (input.tokenExpired) return "connection_expired";
  if (input.webhookFailed) return "webhook_subscription_failed";
  // Prefer live health when available — avoids labeling manual installs as
  // Reauthorization Required merely because connection_status defaulted to not_connected.
  if (input.enabled && input.hasAccessToken && input.healthOk === true) return "connected";
  if (input.enabled && input.hasAccessToken && input.healthOk === false) {
    return "reauthorization_required";
  }
  if (input.stored === "connected" || input.stored === "reauthorization_required") {
    return input.stored;
  }
  if (input.stored === "connection_expired" || input.stored === "webhook_subscription_failed") {
    return input.stored;
  }
  if (!input.enabled || !input.hasAccessToken) return "not_connected";
  // Health not run yet: do not scare operators with Reauthorization Required.
  if (input.healthOk == null) return "connected";
  return "reauthorization_required";
}
