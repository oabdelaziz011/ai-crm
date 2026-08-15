import type { SaasProviderCode } from "./provider-types.js";

/** Server-only credential loader — never reads VITE_* browser env. */
export function loadSaasProviderEnv(provider: SaasProviderCode): Record<string, string | undefined> {
  switch (provider) {
    case "stripe":
      return {
        secretKey: process.env.STRIPE_SECRET_KEY?.trim(),
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim(),
      };
    case "paymob":
      return {
        apiKey: process.env.PAYMOB_API_KEY?.trim(),
        integrationId: process.env.PAYMOB_INTEGRATION_ID?.trim(),
        iframeId: process.env.PAYMOB_IFRAME_ID?.trim(),
        hmacSecret: process.env.PAYMOB_HMAC_SECRET?.trim(),
      };
    case "fawry":
      return {
        merchantCode: process.env.FAWRY_MERCHANT_CODE?.trim(),
        securityKey: process.env.FAWRY_SECURITY_KEY?.trim(),
      };
    case "sandbox":
      return {
        webhookSecret:
          process.env.SAAS_SANDBOX_WEBHOOK_SECRET?.trim() ||
          process.env.INTERNAL_API_KEY?.trim() ||
          "dev-saas-sandbox-webhook",
      };
    default:
      return {};
  }
}
