import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInstagramWebhookUrl,
  buildWhatsAppWebhookUrl,
} from "./whatsapp-channel-utils.ts";

describe("channel webhook URL builders", () => {
  it("uses configured developer tunnel base for Instagram and WhatsApp", () => {
    const base = "https://webhook-dev.example.test";
    assert.equal(buildInstagramWebhookUrl(base), "https://webhook-dev.example.test/api/webhooks/instagram");
    assert.equal(buildWhatsAppWebhookUrl(base), "https://webhook-dev.example.test/api/webhooks/whatsapp");
  });

  it("never invents production webhook.valueor.org when base is empty/local", () => {
    assert.equal(buildWhatsAppWebhookUrl(""), "/api/webhooks/whatsapp");
    assert.equal(buildInstagramWebhookUrl(""), "/api/webhooks/instagram");
    assert.ok(!buildWhatsAppWebhookUrl("http://localhost:3001").includes("webhook.valueor.org"));
  });
});
