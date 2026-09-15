export const INSTAGRAM_WEBHOOK_APP_SECRET_ENV = "INSTAGRAM_WEBHOOK_APP_SECRET";
export const INSTAGRAM_WEBHOOK_APP_SECRET_PREVIOUS_ENV = "INSTAGRAM_WEBHOOK_APP_SECRET_PREVIOUS";
export const INSTAGRAM_WEBHOOK_APP_ID_ENV = "INSTAGRAM_WEBHOOK_APP_ID";

export type InstagramWebhookSecretSource =
  | "env_instagram_webhook_app"
  | "env_instagram_webhook_app_previous"
  | "company_instagram_settings";

export type InstagramWebhookSecretCandidate = {
  source: InstagramWebhookSecretSource;
  secret: string;
  length: number;
};

export type InstagramWebhookSignatureSecretSet = {
  expectedMetaAppId: string | null;
  candidates: InstagramWebhookSecretCandidate[];
};

/**
 * Instagram Login webhooks are HMAC-signed by the Meta app that owns the
 * webhook subscription. Meta's Instagram webhook docs specify App settings →
 * Basic → App secret of that app — not a Page token, not a WhatsApp secret,
 * and not the Instagram App Secret used for Business Login OAuth.
 *
 * Env secrets are tried first so the platform can pin HMAC to the published app
 * even when a company row still holds a previous app's secret.
 *
 * INSTAGRAM_WEBHOOK_APP_ID is diagnostic only. It is never used as HMAC input
 * and does not prove which Meta app owns the live webhook subscription.
 */
export function collectInstagramWebhookSignatureSecrets(input: {
  companyAppSecret?: string | null;
  env?: NodeJS.Dict<string>;
}): InstagramWebhookSignatureSecretSet {
  const env = input.env ?? process.env;
  const seen = new Set<string>();
  const candidates: InstagramWebhookSecretCandidate[] = [];

  const push = (source: InstagramWebhookSecretSource, raw: string | undefined | null) => {
    const secret = raw?.trim() ?? "";
    if (!secret || seen.has(secret)) return;
    seen.add(secret);
    candidates.push({ source, secret, length: secret.length });
  };

  push("env_instagram_webhook_app", env[INSTAGRAM_WEBHOOK_APP_SECRET_ENV]);
  push("env_instagram_webhook_app_previous", env[INSTAGRAM_WEBHOOK_APP_SECRET_PREVIOUS_ENV]);
  push("company_instagram_settings", input.companyAppSecret);

  const expectedMetaAppId = String(env[INSTAGRAM_WEBHOOK_APP_ID_ENV] ?? "").trim() || null;

  return { expectedMetaAppId, candidates };
}