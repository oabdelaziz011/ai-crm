import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "webhooks.ts"), "utf8");

describe("WhatsApp webhook POST signature source contract", () => {
  it("still verifies with the single company WhatsApp App Secret and does not use Instagram multi-secret selection", () => {
    assert.match(source, /verifyWhatsAppWebhookSignature\(/);
    assert.match(
      source,
      /verifyWhatsAppWebhookSignature\(\{[\s\S]*appSecret:\s*appSecretForSignature[\s\S]*requireSecret,[\s\S]*\}\)/,
    );
    assert.doesNotMatch(source, /verifyMetaWebhookSignatureWithSecrets/);
    assert.doesNotMatch(source, /collectInstagramWebhookSignatureSecrets/);
    assert.doesNotMatch(source, /INSTAGRAM_WEBHOOK_APP_SECRET/);
    assert.match(source, /res\.status\(401\)\.json\(\{\s*error:\s*"invalid_signature"\s*\}\)/);
  });
});
