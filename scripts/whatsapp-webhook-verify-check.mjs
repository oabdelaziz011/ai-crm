/**
 * Smoke-check WhatsApp webhook GET verification against a running api-server / tunnel.
 *
 * Usage:
 *   WHATSAPP_VERIFY_TOKEN='your-verify-token' \
 *   WEBHOOK_BASE_URL='https://webhook.valueor.org' \
 *   node scripts/whatsapp-webhook-verify-check.mjs
 *
 * Does not print the verify token.
 */
const base = (process.env.WEBHOOK_BASE_URL || process.env.VITE_WEBHOOK_BASE_URL || "http://127.0.0.1:3000")
  .trim()
  .replace(/\/$/, "");
const token = (process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
const challenge = process.env.WHATSAPP_HUB_CHALLENGE || `vaultos-challenge-${Date.now()}`;

if (!token) {
  console.error("Set WHATSAPP_VERIFY_TOKEN to the same value stored in Settings → WhatsApp.");
  process.exit(1);
}

const url = new URL(`${base}/api/webhooks/whatsapp`);
url.searchParams.set("hub.mode", "subscribe");
url.searchParams.set("hub.verify_token", token);
url.searchParams.set("hub.challenge", challenge);

const res = await fetch(url);
const body = await res.text();

const ok = res.status === 200 && body === challenge;
console.log(
  JSON.stringify(
    {
      ok,
      httpStatus: res.status,
      challengeMatched: body === challenge,
      bodyPreview: body.slice(0, 80),
      urlHost: url.host,
      path: url.pathname,
    },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 2);
