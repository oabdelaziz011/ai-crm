import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  asFacebookLoginCallback,
  isAsyncFunction,
  type FacebookLoginAuthResponse,
  type FacebookSdkLogin,
} from "./whatsapp-facebook-login";

const here = dirname(fileURLToPath(import.meta.url));
const pagePath = join(here, "../../pages/dashboard/settings/whatsapp-settings-page.tsx");
const panelPath = join(here, "../../components/channels/whatsapp-embedded-signup-panel.tsx");
const flagsPath = join(here, "whatsapp-embedded-signup-flags.ts");
const clientPath = join(here, "whatsapp-embedded-signup-client.ts");
const enLocalePath = join(here, "../../locales/en/common.json");
const arLocalePath = join(here, "../../locales/ar/common.json");

describe("WhatsApp Embedded Signup UI contracts", () => {
  const page = readFileSync(pagePath, "utf8");
  const panel = readFileSync(panelPath, "utf8");
  const flags = readFileSync(flagsPath, "utf8");
  const client = readFileSync(clientPath, "utf8");
  const en = readFileSync(enLocalePath, "utf8");
  const ar = readFileSync(arLocalePath, "utf8");

  it("always mounts the dual-path panel on WhatsApp settings", () => {
    assert.match(page, /WhatsAppEmbeddedSignupPanel/);
    assert.match(page, /hasExistingConnection/);
    assert.doesNotMatch(page, /isWhatsAppEmbeddedSignupUiEnabled\(\)/);
  });

  it("gates interactive Meta flows behind UI feature flags", () => {
    assert.match(flags, /VITE_WHATSAPP_EMBEDDED_SIGNUP_ENABLED/);
    assert.match(flags, /VITE_WHATSAPP_COEXISTENCE_ENABLED/);
    assert.match(panel, /isWhatsAppEmbeddedSignupUiEnabled/);
    assert.match(panel, /isWhatsAppCoexistenceUiEnabled/);
    assert.match(panel, /whatsapp-embedded-signup-panel-disabled/);
  });

  it("exposes Option A Coexistence and Option B Cloud API CTAs", () => {
    assert.match(panel, /whatsapp-onboarding-coexistence/);
    assert.match(panel, /whatsapp-onboarding-cloud-api/);
    assert.match(panel, /onConnect\("coexistence"\)/);
    assert.match(panel, /onConnect\("cloud_api_new"\)/);
    // Meta featureType is applied from the server session when Coexistence is selected.
    assert.match(panel, /extras\.featureType = session\.featureType/);
  });

  it("passes onboardingMode to the session API", () => {
    assert.match(client, /onboardingMode/);
    assert.match(client, /cloud_api_new/);
    assert.match(client, /coexistence/);
    assert.match(panel, /createWhatsAppEmbeddedSignupSession\(companyId, mode\)/);
  });

  it("keeps Manual Connection fields on the settings page", () => {
    assert.match(page, /phoneNumberId/);
    assert.match(page, /webhookVerifyToken/);
    assert.match(page, /accessToken/);
    assert.match(page, /onSave/);
    assert.match(page, /onConnectionTest/);
  });

  it("does not load Facebook SDK until Connect is used", () => {
    assert.match(panel, /loadFacebookSdk/);
    assert.doesNotMatch(panel, /connect\.facebook\.net[\s\S]{0,80}document\.head\.append/);
  });

  it("does not implement a ValueOR QR generator or WhatsApp Web pairing", () => {
    // Lucide QrCode icon is allowed as UI affordance; ValueOR must never generate QR payloads.
    assert.doesNotMatch(panel, /generateQr|qrcode\.toDataURL|QRCode\.toCanvas|new QRCode/i);
    assert.doesNotMatch(panel, /web\.whatsapp\.com/i);
    assert.match(panel, /Never fabricates QR codes/);
  });

  it("includes EN and AR copy for dual onboarding options", () => {
    assert.match(en, /"optionATitle"/);
    assert.match(en, /"optionBTitle"/);
    assert.match(ar, /"optionATitle"/);
    assert.match(ar, /"optionBTitle"/);
  });

  it("does not pass an AsyncFunction directly to fb.login", () => {
    assert.match(panel, /asFacebookLoginCallback\(handleLoginResponse\)/);
    assert.match(panel, /const handleLoginResponse = async/);
    assert.doesNotMatch(panel, /fb\.login\(\s*async\s*\(/);
    assert.doesNotMatch(panel, /\.login\(\s*async\s*\(/);
  });
});

describe("Facebook login callback wrapper (FB.login AsyncFunction guard)", () => {
  it("returns a synchronous function, not an AsyncFunction", () => {
    const wrapped = asFacebookLoginCallback(async () => undefined);
    assert.equal(typeof wrapped, "function");
    assert.equal(isAsyncFunction(wrapped), false);
    assert.equal(isAsyncFunction(async () => undefined), true);
  });

  it("invokes the async response handler when FB.login fires the sync callback", async () => {
    const seen: FacebookLoginAuthResponse[] = [];
    let completeCalls = 0;
    let failedCalls = 0;

    const handleLoginResponse = async (response: FacebookLoginAuthResponse) => {
      seen.push(response);
      const code = response.authResponse?.code?.trim();
      if (!code) {
        failedCalls += 1;
        return;
      }
      completeCalls += 1;
    };

    const fb: FacebookSdkLogin = {
      login(cb, opts) {
        assert.equal(isAsyncFunction(cb), false);
        assert.equal(opts.config_id, "cloud-config");
        cb({ authResponse: { code: "meta-code" } });
      },
    };

    fb.login(asFacebookLoginCallback(handleLoginResponse), {
      config_id: "cloud-config",
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, sessionInfoVersion: "3" },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.authResponse?.code, "meta-code");
    assert.equal(completeCalls, 1);
    assert.equal(failedCalls, 0);
  });

  it("preserves cancelled / error handling without unhandled rejections", async () => {
    const events: string[] = [];

    const handleLoginResponse = async (response: FacebookLoginAuthResponse) => {
      try {
        if (!response.authResponse?.code?.trim()) {
          events.push("cancelled");
          return;
        }
        throw Object.assign(new Error("complete failed"), { code: "ES_CONNECTION_EXISTS" });
      } catch (error) {
        const code = (error as Error & { code?: string }).code;
        events.push(code === "ES_CONNECTION_EXISTS" ? "existingConnection" : "failed");
      } finally {
        events.push("clearedBusy");
      }
    };

    asFacebookLoginCallback(handleLoginResponse)({ authResponse: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(events, ["cancelled", "clearedBusy"]);

    events.length = 0;
    asFacebookLoginCallback(handleLoginResponse)({ authResponse: { code: "x" } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(events, ["existingConnection", "clearedBusy"]);
  });
});
