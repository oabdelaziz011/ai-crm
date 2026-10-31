#!/usr/bin/env node
/**
 * Static integration contract. Does not call providers and does not print secret values.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const INTEGRATION_SOURCES = [
  {
    name: "payments",
    file: "artifacts/api-server/src/billing/saas/provider-credentials.ts",
    keys: [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "PAYMOB_API_KEY",
      "PAYMOB_INTEGRATION_ID",
      "PAYMOB_IFRAME_ID",
      "PAYMOB_HMAC_SECRET",
      "FAWRY_MERCHANT_CODE",
      "FAWRY_SECURITY_KEY",
      "SAAS_SANDBOX_WEBHOOK_SECRET",
    ],
  },
  {
    name: "whatsapp-meta",
    file: "artifacts/api-server/src/services/whatsapp-embedded-signup-flags.ts",
    keys: [
      "META_EMBEDDED_SIGNUP_APP_ID",
      "META_EMBEDDED_SIGNUP_APP_SECRET",
      "META_EMBEDDED_SIGNUP_CONFIG_ID",
      "WHATSAPP_EMBEDDED_SIGNUP_ENABLED",
      "WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE",
    ],
  },
];

export function missingIntegrationKeys() {
  const missing = [];
  for (const source of INTEGRATION_SOURCES) {
    const text = readFileSync(resolve(root, source.file), "utf8");
    for (const key of source.keys) {
      if (!text.includes(key)) missing.push(`${source.name}:${key}`);
    }
  }
  return missing;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const missing = missingIntegrationKeys();
  if (missing.length) {
    console.error(missing.join("\n"));
    process.exit(1);
  }
  console.log("Integration env contracts still match the server source.");
  console.log("Live WhatsApp, Instagram, Messenger, email, and payment calls were not made.");
  console.log("Webhook delivery stays blocked until webhook.valueor.org reaches a production API /api/readyz.");
}
