import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routePath = join(here, "whatsapp-embedded-signup.ts");
const whatsappRoutePath = join(here, "whatsapp.ts");
const indexPath = join(here, "index.ts");
const flagsPath = join(here, "..", "services", "whatsapp-embedded-signup-flags.ts");

describe("whatsapp-embedded-signup routes (security contracts)", () => {
  const route = readFileSync(routePath, "utf8");
  const index = readFileSync(indexPath, "utf8");
  const flags = readFileSync(flagsPath, "utf8");
  const whatsappRoute = readFileSync(whatsappRoutePath, "utf8");

  it("mounts isolated router without modifying webhook routes", () => {
    assert.match(index, /whatsappEmbeddedSignupRouter/);
    assert.match(index, /whatsappRouter/);
    assert.doesNotMatch(index, /webhooks/);
  });

  it("requires auth, company scope, commercial feature, feature flag, and company allowlist", () => {
    assert.match(route, /requireSupabaseAuth/);
    assert.match(route, /requireCompanyScope\("companyId"\)/);
    assert.match(route, /assertRouteCommercialFeature\(companyId, "whatsapp_channel"\)/);
    assert.match(route, /isWhatsAppEmbeddedSignupEnabled/);
    assert.match(route, /ES_DISABLED/);
    assert.match(route, /isWhatsAppEmbeddedSignupCompanyAllowed/);
    assert.match(route, /assertCompanyAllowedForEmbeddedSignup/);
    assert.match(route, /ES_COMPANY_NOT_ALLOWED/);
  });

  it("enforces allowlist on session, complete, and status endpoints", () => {
    for (const path of [
      "/whatsapp/embedded-signup/session",
      "/whatsapp/embedded-signup/complete",
      "/whatsapp/embedded-signup/status",
    ]) {
      assert.match(route, new RegExp(path.replace(/\//g, "\\/")));
    }
    const sessionIdx = route.indexOf("/whatsapp/embedded-signup/session");
    const completeIdx = route.indexOf("/whatsapp/embedded-signup/complete");
    const statusIdx = route.indexOf("/whatsapp/embedded-signup/status");
    for (const idx of [sessionIdx, completeIdx, statusIdx]) {
      assert.ok(idx >= 0);
      const slice = route.slice(idx, idx + 900);
      assert.match(slice, /assertCompanyAllowedForEmbeddedSignup\(companyId\)/);
    }
  });

  it("keeps auth/scope before allowlist so unauthorized and cross-company requests are denied first", () => {
    const authIdx = route.indexOf("requireSupabaseAuth");
    const scopeIdx = route.indexOf('requireCompanyScope("companyId")');
    const allowIdx = route.indexOf("assertCompanyAllowedForEmbeddedSignup");
    assert.ok(authIdx >= 0 && scopeIdx > authIdx && allowIdx > scopeIdx);
  });

  it("deny-by-default allowlist lives in flags and documents DEMO Beta seed without auto-allow", () => {
    assert.match(flags, /WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS/);
    assert.match(flags, /isWhatsAppEmbeddedSignupCompanyAllowed/);
    assert.match(flags, /d0000010-0001-4001-8001-000000000002/);
    assert.match(flags, /never auto-allowed|Deny when company id is missing/i);
  });

  it("does not call Meta subscribe helpers from the route module", () => {
    assert.doesNotMatch(route, /maybeSubscribeWabaToWebhook|subscribed_apps/);
  });

  it("leaves existing WhatsApp settings/test-connection routes free of ES allowlist", () => {
    assert.doesNotMatch(whatsappRoute, /isWhatsAppEmbeddedSignupCompanyAllowed/);
    assert.doesNotMatch(whatsappRoute, /ES_COMPANY_NOT_ALLOWED/);
    assert.doesNotMatch(whatsappRoute, /WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS/);
  });
});
