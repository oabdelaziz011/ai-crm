import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SETTINGS_ROUTE_REGISTRY,
  settingsNavItems,
} from "../src/config/settings-route-registry.ts";
import { isSettingsRoutePermitted } from "../src/lib/settings/settings-permissions.ts";
import { resolveDefaultChannelProvider } from "../src/lib/channels/channel-defaults.ts";
import {
  resolveSmsConnectionStatus,
  type CompanySmsSettings,
} from "../src/lib/channels/sms-settings-status.ts";
import {
  CHANNEL_MANAGEMENT_UI_CHANNEL_KEYS,
  isChannelManagementUiSupported,
} from "../src/lib/billing/channel-management-entitlement.ts";
import { resolveChannelCommercialFeatureCode } from "../src/lib/billing/feature-code-map.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const en = JSON.parse(readFileSync(join(root, "src/locales/en/common.json"), "utf8"));
const ar = JSON.parse(readFileSync(join(root, "src/locales/ar/common.json"), "utf8"));
const settingsPage = readFileSync(
  join(root, "src/pages/dashboard/settings/sms-settings-page.tsx"),
  "utf8",
);
const messengerPage = readFileSync(
  join(root, "src/pages/dashboard/settings/messenger-settings-page.tsx"),
  "utf8",
);
const instagramPage = readFileSync(
  join(root, "src/pages/dashboard/settings/instagram-settings-page.tsx"),
  "utf8",
);
const whatsappPage = readFileSync(
  join(root, "src/pages/dashboard/settings/whatsapp-settings-page.tsx"),
  "utf8",
);
const emailPage = readFileSync(
  join(root, "src/pages/dashboard/settings/email-settings-page.tsx"),
  "utf8",
);
const smsLib = readFileSync(join(root, "src/lib/channels/sms-settings.ts"), "utf8");
const migration = readFileSync(
  join(root, "../../supabase/migrations/373_company_sms_settings.sql"),
  "utf8",
);

function dig(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function assertLocaleString(path: string, enExpected: string, arExpected: string) {
  assert.equal(dig(en, path), enExpected, `EN ${path}`);
  assert.equal(dig(ar, path), arExpected, `AR ${path}`);
}

describe("SMS Settings Phase 2A", () => {
  it("1 — SMS appears in communication channel settings registry", () => {
    const route = SETTINGS_ROUTE_REGISTRY.find((r) => r.id === "sms");
    assert.ok(route);
    assert.equal(route.nestedPath, "/sms");
    assert.equal(route.titleKey, "dashboard.settings.nav.sms");
    assert.equal(route.permission, "settings.edit");
    assert.equal(route.commercialFeatureCode, "sms_channel");
  });

  it("2 — SMS uses existing channel settings architecture (not a parallel tree)", () => {
    assert.match(settingsPage, /DashboardCard/);
    assert.match(settingsPage, /useSmsSettings/);
    assert.match(settingsPage, /notifications\.sms\.settings/);
    assert.doesNotMatch(settingsPage, /company_sms_channels/);
    assert.match(migration, /company_sms_settings/);
    assert.match(migration, /credentialsSource/);
    assert.match(migration, /company_sms_settings/);
    assert.doesNotMatch(migration, /create table.*sms_channels/i);
  });

  it("3 — SMS configuration is company scoped", () => {
    assert.match(migration, /company_id uuid primary key/);
    assert.match(migration, /current_company_id\(\)/);
    assert.match(smsLib, /p_company_id: companyId/);
  });

  it("4 — Commercial gate uses sms_channel", () => {
    const route = SETTINGS_ROUTE_REGISTRY.find((r) => r.id === "sms")!;
    assert.equal(route.commercialFeatureCode, "sms_channel");
    assert.equal(resolveChannelCommercialFeatureCode("sms"), "sms_channel");
    assert.equal(
      isSettingsRoutePermitted(route, () => true, false, (c) => c === "sms_channel"),
      true,
    );
    assert.equal(
      isSettingsRoutePermitted(route, () => true, false, (c) => c === "whatsapp_channel"),
      false,
    );
  });

  it("5 — Permission gate uses settings.edit like WhatsApp/Messenger", () => {
    const route = SETTINGS_ROUTE_REGISTRY.find((r) => r.id === "sms")!;
    assert.equal(route.permission, "settings.edit");
    assert.equal(
      isSettingsRoutePermitted(
        route,
        (c) => c === "settings.view" || c === "settings.edit",
        false,
        (c) => c === "sms_channel",
      ),
      true,
    );
    assert.equal(
      isSettingsRoutePermitted(route, (c) => c === "sms.view", false, (c) => c === "sms_channel"),
      false,
    );
    const ids = settingsNavItems(
      (c) => c === "settings.view" || c === "settings.edit",
      false,
      (c) => c === "sms_channel",
    ).map((r) => r.id);
    assert.ok(ids.includes("sms"));
  });

  it("6 — Disabled SMS resolves not operable", () => {
    const disabled: CompanySmsSettings = {
      companyId: "c1",
      enabled: false,
      provider: "twilio",
      accountSid: "ACxxx",
      fromNumber: "+15551234567",
      authToken: "",
      hasAuthToken: true,
    };
    assert.equal(resolveSmsConnectionStatus(disabled).status, "disabled");
  });

  it("7 — Provider credentials never reach client mapping as plaintext SoT", () => {
    assert.match(smsLib, /has_auth_token/);
    assert.match(migration, /whatsapp_mask_secret/);
    assert.match(migration, /auth_token_encrypted/);
    assert.match(migration, /get_company_sms_settings_decrypted/);
    assert.match(migration, /auth\.role\(\) <> 'service_role'/);
    assert.match(settingsPage, /Never reload masked RPC values/);
    assert.doesNotMatch(settingsPage, /localStorage/);
  });

  it("8/9 — Save/update go through upsert RPC", () => {
    assert.match(smsLib, /upsert_company_sms_settings/);
    assert.match(smsLib, /p_enabled: settings\.enabled/);
    assert.match(smsLib, /p_auth_token: settings\.authToken/);
  });

  it("10 — Connection status never fakes Connected without configuration", () => {
    assert.equal(resolveSmsConnectionStatus(null).status, "not_connected");
    assert.equal(
      resolveSmsConnectionStatus({
        companyId: "c1",
        enabled: true,
        provider: "",
        accountSid: "",
        fromNumber: "",
        authToken: "",
        hasAuthToken: false,
      }).status,
      "not_connected",
    );
    assert.equal(
      resolveSmsConnectionStatus({
        companyId: "c1",
        enabled: true,
        provider: "twilio",
        accountSid: "ACxxx",
        fromNumber: "+15551234567",
        authToken: "",
        hasAuthToken: true,
      }).status,
      "connected",
    );
  });

  it("11/12 — Test connection path is real API, missing provider fails in UI boundary", () => {
    assert.match(smsLib, /\/sms\/test-connection/);
    assert.match(settingsPage, /providerBoundary/);
    assert.match(settingsPage, /sms-test-connection/);
  });

  it("13/14 — EN + AR localization complete for SMS settings", () => {
    assertLocaleString("dashboard.settings.nav.sms", "SMS", "الرسائل النصية");
    assertLocaleString("notifications.sms.settings.title", "SMS Settings", "إعدادات الرسائل النصية");
    assertLocaleString("notifications.sms.settings.provider", "Provider", "المزوّد");
    assertLocaleString("notifications.sms.settings.fromNumber", "Sender Number", "رقم المرسل");
    assertLocaleString("notifications.sms.settings.status.connected", "Connected", "متصل");
    assertLocaleString("notifications.sms.settings.status.not_connected", "Not Connected", "غير متصل");
    assertLocaleString("notifications.sms.settings.status.disabled", "Disabled", "معطّل");
    assertLocaleString("notifications.sms.settings.enabled", "Enable SMS", "تفعيل الرسائل النصية");
    assertLocaleString("notifications.sms.settings.connectionTest", "Test Connection", "اختبار الاتصال");
    assertLocaleString("notifications.sms.settings.webhookUrl", "Webhook", "Webhook");
  });

  it("15 — RTL-ready: AR strings present and page uses shared DashboardCard layout", () => {
    assert.ok(String(dig(ar, "notifications.sms.settings.title")).length > 0);
    assert.match(settingsPage, /space-y-6/);
    assert.match(settingsPage, /sm:grid-cols-2/);
  });

  it("16/17/18 — Existing WhatsApp/Instagram/Messenger settings pages unchanged by SMS route", () => {
    assert.match(whatsappPage, /SettingsWhatsAppPage/);
    assert.match(instagramPage, /SettingsInstagramPage/);
    assert.match(messengerPage, /SettingsMessengerPage/);
    assert.doesNotMatch(whatsappPage, /sms-settings/);
    assert.doesNotMatch(instagramPage, /sms-settings/);
    assert.doesNotMatch(messengerPage, /sms-settings/);
  });

  it("19 — Existing Email Settings unchanged", () => {
    assert.match(emailPage, /SettingsEmailPage|email/i);
    assert.doesNotMatch(emailPage, /sms-settings|company_sms_settings/);
  });

  it("SMS uses channel defaults + management UI keys without duplicate table", () => {
    assert.equal(resolveDefaultChannelProvider("sms"), "twilio");
    assert.equal(isChannelManagementUiSupported("sms"), true);
    assert.ok(CHANNEL_MANAGEMENT_UI_CHANNEL_KEYS.has("sms"));
  });
});
