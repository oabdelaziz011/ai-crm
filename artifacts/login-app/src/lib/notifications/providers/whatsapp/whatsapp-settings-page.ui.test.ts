import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const pagePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../pages/dashboard/settings/whatsapp-settings-page.tsx",
);

describe("WhatsApp settings page UI contracts", () => {
  const source = readFileSync(pagePath, "utf8");

  it("keeps webhook callback URL editable (not readOnly/disabled)", () => {
    assert.match(source, /id="whatsapp-webhook-callback-url"/);
    assert.match(source, /onWebhookCallbackUrlChange/);
    assert.doesNotMatch(
      source,
      /id="whatsapp-webhook-callback-url"[\s\S]{0,200}readOnly/,
    );
    assert.doesNotMatch(source, /<Input value=\{webhookCallbackUrl\} readOnly/);
  });

  it("keeps configuration editable independently of the enabled toggle", () => {
    assert.match(source, /checked=\{draft\.enabled\}/);
    assert.match(source, /phoneNumberId/);
    assert.match(source, /webhookVerifyToken/);
    // Credential inputs must not be gated by draft.enabled
    assert.doesNotMatch(source, /disabled=\{!draft\.enabled\}/);
    assert.doesNotMatch(source, /disabled=\{!settings\?\.enabled\}/);
  });

  it("surfaces a readable disabled-provider health state via i18n keys", () => {
    assert.match(source, /providerDisabledTitle/);
    assert.match(source, /providerDisabledHint/);
    assert.match(source, /role="status"/);
    assert.match(source, /role="alert"/);
  });

  it("hydrates and persists webhook callback URL from settings (not env-only)", () => {
    assert.match(source, /resolveInitialWebhookCallbackUrl/);
    assert.match(source, /settings\.webhookCallbackUrl/);
    assert.match(source, /p_webhook_callback_url|webhookCallbackUrl: trimmedCallback/);
    assert.match(source, /webhookCallbackUrl: callbackUrl/);
  });

  it("keeps blank secret fields as preserve-existing UX", () => {
    assert.match(source, /secretKeepPlaceholder/);
    assert.match(source, /secretLeaveBlankHint/);
    assert.match(source, /settings\?\.hasAccessToken/);
    assert.match(source, /settings\?\.hasWebhookVerifyToken/);
    assert.match(source, /settings\?\.hasAppSecret/);
  });

  it("keeps Manual Connection path when Embedded Signup UI is gated", () => {
    assert.match(source, /isWhatsAppEmbeddedSignupUiEnabled/);
    assert.match(source, /WhatsAppEmbeddedSignupPanel/);
    assert.match(source, /phoneNumberId/);
    assert.match(source, /onConnectionTest/);
  });
});
