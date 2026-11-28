import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const routePath = join(dirname(fileURLToPath(import.meta.url)), "whatsapp.ts");
const providerPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../login-app/src/lib/notifications/providers/whatsapp/services/whatsapp-provider.ts",
);

describe("whatsapp template routes (security contracts)", () => {
  const source = readFileSync(routePath, "utf8");
  const providerSource = readFileSync(providerPath, "utf8");

  it("requires auth and company scope before template endpoints", () => {
    const authIdx = source.indexOf("requireSupabaseAuth");
    const scopeIdx = source.indexOf('requireCompanyScope("companyId")');
    const catalogIdx = source.indexOf('"/whatsapp/templates/catalog"');
    const listIdx = source.indexOf('router.get("/whatsapp/templates"');
    const syncIdx = source.indexOf('"/whatsapp/templates/sync"');
    const provisionIdx = source.indexOf('"/whatsapp/templates/provision"');
    assert.ok(authIdx >= 0 && scopeIdx > authIdx);
    assert.ok(catalogIdx > scopeIdx);
    assert.ok(listIdx > scopeIdx);
    assert.ok(syncIdx > scopeIdx);
    assert.ok(provisionIdx > scopeIdx);
  });

  it("gates list/sync/provision with commercial feature and settings.edit", () => {
    for (const marker of [
      'router.get("/whatsapp/templates"',
      'router.post("/whatsapp/templates/sync"',
      'router.post("/whatsapp/templates/provision"',
    ]) {
      const idx = source.indexOf(marker);
      assert.ok(idx >= 0, marker);
      const slice = source.slice(idx, idx + 1800);
      assert.match(slice, /assertRouteCommercialFeature\(companyId, "whatsapp_channel"\)/);
      assert.match(slice, /WHATSAPP_SETTINGS_MANAGE_PERMISSION|settings\.edit/);
      assert.match(slice, /requireRequestCompanyPermission/);
    }
  });

  it("uses template-admin credential loader (not outbound enabled gate) for sync/provision", () => {
    for (const marker of [
      'router.post("/whatsapp/templates/sync"',
      'router.post("/whatsapp/templates/provision"',
    ]) {
      const idx = source.indexOf(marker);
      assert.ok(idx >= 0, marker);
      const slice = source.slice(idx, idx + 4500);
      assert.match(slice, /loadTemplateAdminCredentialsForCompany|loadWhatsAppTemplateAdminCredentials/);
      assert.doesNotMatch(slice, /WhatsApp provider is disabled|whatsapp_disabled/);
      assert.doesNotMatch(slice, /if\s*\(\s*!settings\?\.enabled/);
      assert.match(slice, /businessAccountId:\s*credentials\.businessAccountId/);
      assert.match(slice, /accessToken:\s*credentials\.accessToken/);
    }
  });

  it("loads decrypted credentials only for the requested companyId", () => {
    assert.match(source, /loadWhatsAppTemplateAdminCredentials|getSecure\(companyId\)/);
    assert.match(source, /businessAccountId: credentials\.businessAccountId|businessAccountId: settings\.businessAccountId/);
    assert.match(source, /accessToken: credentials\.accessToken|accessToken: settings\.accessToken/);
    assert.doesNotMatch(source, /getSecure\([^)]*other/i);
  });

  it("maps setup-pending and Meta permission failures without trusting frontend approval", () => {
    assert.match(source, /WHATSAPP_TEMPLATE_SETUP_PENDING|isWhatsAppTemplateSetupError/);
    assert.match(source, /setupPending/);
    assert.doesNotMatch(source, /approvalStatus\s*:\s*["']approved["']/);
  });

  it("keeps outbound WhatsApp sending blocked when messaging is disabled", () => {
    assert.match(providerSource, /if\s*\(\s*!settings\?\.enabled\s*\)/);
    assert.match(providerSource, /WhatsApp provider is disabled/);
    assert.match(providerSource, /async sendFreeformText/);
    // Template admin routes must not share that enabled rejection.
    const syncIdx = source.indexOf('"/whatsapp/templates/sync"');
    const provisionIdx = source.indexOf('"/whatsapp/templates/provision"');
    const syncSlice = source.slice(syncIdx, syncIdx + 2200);
    const provisionSlice = source.slice(provisionIdx, provisionIdx + 2200);
    assert.doesNotMatch(syncSlice, /WhatsApp provider is disabled/);
    assert.doesNotMatch(provisionSlice, /WhatsApp provider is disabled/);
  });

  it("does not trust client sessionWindowOpen on /whatsapp/send-text", () => {
    const idx = source.indexOf('"/whatsapp/send-text"');
    assert.ok(idx >= 0);
    const slice = source.slice(idx, idx + 1200);
    assert.doesNotMatch(slice, /sessionWindowOpen\s*=\s*req\.body/);
    assert.match(slice, /intentionally ignored|channel_sessions\.last_inbound_at/);
    assert.match(providerSource, /loadWhatsAppLastInboundAtForRecipient/);
    assert.match(providerSource, /resolveTrustedWhatsAppSessionWindowOpen/);
  });

  it("documents unauthorized and cross-company denial via auth + company scope middleware", () => {
    assert.match(source, /requireSupabaseAuth/);
    assert.match(source, /requireCompanyScope\("companyId"\)/);
    assert.match(source, /requireRequestCompanyPermission\(req, companyId, WHATSAPP_SETTINGS_MANAGE_PERMISSION\)/);
  });

  it("accepts optional purposes[] for scoped provisioning and rejects connection_test", () => {
    const idx = source.indexOf('router.post("/whatsapp/templates/provision"');
    assert.ok(idx >= 0);
    const slice = source.slice(idx, idx + 3200);
    assert.match(slice, /purposes/);
    assert.match(slice, /connection_test/);
    assert.match(slice, /purposes_invalid|isWhatsAppMessagePurpose/);
  });

  it("gates send-purpose with sales/settings permission and rejects connection_test", () => {
    const idx = source.indexOf('router.post("/whatsapp/send-purpose"');
    assert.ok(idx >= 0);
    const slice = source.slice(idx, idx + 2200);
    assert.match(slice, /requireRequestAnyCompanyPermission/);
    assert.match(slice, /WHATSAPP_PURPOSE_SEND_PERMISSIONS|orders\.edit/);
    assert.match(slice, /connection_test_not_allowed|purpose === "connection_test"/);
    assert.match(slice, /assertRouteCommercialFeature\(companyId, "whatsapp_channel"\)/);
  });

  it("rejects GET template companyId mismatch between query and body", () => {
    assert.match(source, /companyId_mismatch/);
  });

  it("copies query companyId onto body for all GET routes before requireCompanyScope", () => {
    const scopeIdx = source.indexOf('requireCompanyScope("companyId")');
    const copyIdx = source.indexOf("req.body = { ...body, companyId: queryCompanyId }");
    assert.ok(copyIdx >= 0 && scopeIdx > copyIdx);
    // Must not path-gate the copy — mount path shapes vary in production.
    const middlewareSlice = source.slice(copyIdx - 500, scopeIdx);
    assert.doesNotMatch(middlewareSlice, /path\.includes\("\/whatsapp\/templates"\)/);
  });
});
