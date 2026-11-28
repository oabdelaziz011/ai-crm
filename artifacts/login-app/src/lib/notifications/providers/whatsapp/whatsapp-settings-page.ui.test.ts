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
    assert.match(source, /WhatsAppEmbeddedSignupPanel/);
    assert.match(source, /phoneNumberId/);
    assert.match(source, /onConnectionTest/);
  });

  it("includes Message Templates panel for Meta sync status", () => {
    assert.match(source, /WhatsAppMessageTemplatesPanel/);
  });
});

describe("WhatsApp message templates panel UI contracts", () => {
  const panelPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../components/channels/whatsapp-message-templates-panel.tsx",
  );
  const panel = readFileSync(panelPath, "utf8");
  const page = readFileSync(pagePath, "utf8");

  it("exposes provision + sync actions and setup-pending state", () => {
    assert.match(panel, /whatsapp-templates-provision/);
    assert.match(panel, /whatsapp-templates-sync/);
    assert.match(panel, /whatsapp-templates-setup-pending|setupPending/);
    assert.match(panel, /useProvisionWhatsAppCompanyTemplates/);
  });

  it("defaults to single-purpose provisioning with confirmation before Meta create", () => {
    assert.match(panel, /whatsapp-templates-provision-scope/);
    assert.match(panel, /PROVISION_ALL_VALUE|__all__/);
    assert.match(panel, /whatsapp-templates-provision-confirm/);
    assert.match(panel, /setConfirmOpen\(true\)/);
    assert.match(panel, /purposes:\s*selectedPurposes/);
    assert.match(panel, /WHATSAPP_TRANSACTIONAL_PURPOSES\[0\]/);
  });

  it("gates template admin on WABA + token, not outbound messaging enabled", () => {
    assert.match(panel, /hasBusinessAccountId && hasAccessToken/);
    assert.match(panel, /messagingDisabledAdminOk/);
    assert.match(panel, /whatsapp-templates-admin-unavailable/);
    assert.match(panel, /wabaMissingHint|tokenMissingHint/);
    assert.doesNotMatch(panel, /disabled=\{[^}]*messagingEnabled/);
    assert.match(page, /hasBusinessAccountId=\{/);
    assert.match(page, /hasAccessToken=\{/);
    assert.match(page, /messagingEnabled=\{/);
  });
});

describe("Sales order WhatsApp template disabled-state contracts", () => {
  const salesPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../components/sales-orders/sales-order-details-panel.tsx",
  );
  const sales = readFileSync(salesPath, "utf8");

  it("surfaces blocker banner and disables retry notify when template unapproved", () => {
    assert.match(sales, /sales-order-whatsapp-template-blocker/);
    assert.match(sales, /workerDispatchReady/);
    assert.match(sales, /disabled=\{busy \|\| !workerDispatchReady\}/);
  });
});

