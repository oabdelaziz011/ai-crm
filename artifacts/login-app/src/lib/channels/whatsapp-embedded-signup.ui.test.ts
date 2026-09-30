import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pagePath = join(here, "../../pages/dashboard/settings/whatsapp-settings-page.tsx");
const panelPath = join(here, "../../components/channels/whatsapp-embedded-signup-panel.tsx");
const flagsPath = join(here, "whatsapp-embedded-signup-flags.ts");

describe("WhatsApp Embedded Signup UI contracts", () => {
  const page = readFileSync(pagePath, "utf8");
  const panel = readFileSync(panelPath, "utf8");
  const flags = readFileSync(flagsPath, "utf8");

  it("gates the Meta panel behind the UI feature flag", () => {
    assert.match(page, /isWhatsAppEmbeddedSignupUiEnabled\(\)/);
    assert.match(page, /WhatsAppEmbeddedSignupPanel/);
    assert.match(flags, /VITE_WHATSAPP_EMBEDDED_SIGNUP_ENABLED/);
    assert.match(flags, /VITE_WHATSAPP_COEXISTENCE_ENABLED/);
  });

  it("keeps Manual Connection fields on the settings page", () => {
    assert.match(page, /phoneNumberId/);
    assert.match(page, /webhookVerifyToken/);
    assert.match(page, /accessToken/);
    assert.match(page, /onSave/);
    assert.match(page, /onConnectionTest/);
  });

  it("does not load Facebook SDK until Connect is used (no top-level script inject)", () => {
    assert.match(panel, /loadFacebookSdk/);
    assert.doesNotMatch(panel, /connect\.facebook\.net[\s\S]{0,80}document\.head\.append/);
    // SDK script is created inside loadFacebookSdk, not at module import time.
    assert.match(panel, /if \(!uiEnabled\) \{\s*return null;/);
  });

  it("does not implement a ValueOR QR generator", () => {
    assert.doesNotMatch(panel, /QRCode|qrcode|generateQr|canvas.*qr/i);
  });
});
