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
  if (input.stored) return input.stored;
  if (input.tokenExpired) return "connection_expired";
  if (input.webhookFailed) return "webhook_subscription_failed";
  if (input.enabled && input.hasAccessToken && input.healthOk === true) return "connected";
  if (input.enabled && input.hasAccessToken && input.healthOk === false) {
    return "reauthorization_required";
  }
  if (!input.enabled || !input.hasAccessToken) return "not_connected";
  return "reauthorization_required";
}
