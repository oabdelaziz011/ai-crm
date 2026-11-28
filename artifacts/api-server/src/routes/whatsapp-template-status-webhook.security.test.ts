import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const webhooksPath = join(dirname(fileURLToPath(import.meta.url)), "webhooks.ts");
const templateWebhookServicePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../login-app/src/lib/notifications/providers/whatsapp/services/whatsapp-template-status-webhook.ts",
);

describe("whatsapp template-status webhook route security contracts", () => {
  const source = readFileSync(webhooksPath, "utf8");
  const serviceSource = readFileSync(templateWebhookServicePath, "utf8");

  const templateBlock = () => {
    const start = source.indexOf("Template approval status updates");
    const end = source.indexOf("const inboundMessageCount");
    assert.ok(start >= 0 && end > start, "template-status block boundaries missing");
    return source.slice(start, end);
  };

  it("uses processSecureWhatsAppTemplateStatusWebhook (signature before DB)", () => {
    assert.match(source, /processSecureWhatsAppTemplateStatusWebhook/);
    assert.match(source, /WhatsAppTemplateWebhookAuthError/);
    assert.match(source, /requireSecret:true|signatureVerified: true/);
  });

  it("does not call tenant credential appSecret loop for template-status auth", () => {
    const slice = templateBlock();
    assert.doesNotMatch(slice, /credentialsLoader\.loadByCompanyId/);
    assert.doesNotMatch(slice, /resolveWebhookAppSecret\(credentials\)/);
    assert.match(slice, /verifyFn:\s*verifyWhatsAppWebhookSignature/);
  });

  it("returns 401/503 on auth errors and 409 on ambiguous WABA before success response", () => {
    const slice = templateBlock();
    assert.match(slice, /WhatsAppTemplateWebhookAuthError/);
    assert.match(slice, /ambiguous_waba_mapping/);
    assert.match(slice, /status\(secureError\.statusCode\)/);
    assert.match(slice, /status\(409\)/);
  });

  it("deprecated handler cannot bypass signature verification (removed)", () => {
    assert.doesNotMatch(serviceSource, /\bhandleWhatsAppTemplateStatusWebhook\b/);
    assert.doesNotMatch(source, /\bhandleWhatsAppTemplateStatusWebhook\b/);
    assert.match(serviceSource, /processSecureWhatsAppTemplateStatusWebhook/);
    assert.match(serviceSource, /assertValidTemplateStatusWebhookSignature/);
  });

  it("template-status processing failure never falls through to messaging", () => {
    const slice = templateBlock();
    assert.match(slice, /never fall through|template_status_processing_failed/);
    assert.match(slice, /status\(500\)/);
    assert.match(slice, /template_status_processing_failed/);
    // Every failure path in the identified-events block must return — no fallthrough.
    assert.doesNotMatch(slice, /Fall through/);
    assert.doesNotMatch(slice, /fall through only/i);
    // After 500 response there must be an explicit return before messaging continues.
    const idx500 = slice.indexOf("status(500)");
    assert.ok(idx500 >= 0);
    const after500 = slice.slice(idx500);
    assert.match(after500, /return;/);
  });

  it("database / processing failures map to HTTP 500 inside template-status path", () => {
    const slice = templateBlock();
    assert.match(slice, /WhatsAppTemplateWebhookProcessingError/);
    assert.match(slice, /httpStatus:\s*500/);
    assert.match(slice, /error:\s*"template_status_processing_failed"/);
  });

  it("preserves auth and isolation status codes (401/503/409)", () => {
    const slice = templateBlock();
    assert.match(slice, /secureError\.statusCode/);
    assert.match(slice, /status\(409\)/);
    assert.match(slice, /ambiguous_waba_mapping/);
  });

  it("template-status path returns before inbound messaging counters", () => {
    const slice = templateBlock();
    // Success and all error branches return inside the templateEvents > 0 block.
    assert.match(slice, /templateEvents\.length > 0/);
    assert.match(slice, /handled:\s*"message_template_status_update"/);
    const returns = slice.match(/\breturn;/g) ?? [];
    assert.ok(returns.length >= 4, `expected >=4 returns in template block, got ${returns.length}`);
  });
});
