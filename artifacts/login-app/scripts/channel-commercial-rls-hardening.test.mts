/**
 * B1.2 Part 2 — channel commercial RLS hardening (migration 344).
 * Run: node --experimental-strip-types --test artifacts/login-app/scripts/channel-commercial-rls-hardening.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");
const migration343 = readFileSync(
  resolve(projectRoot, "supabase/migrations/343_channel_permission_commercial_mapping.sql"),
  "utf8",
);
const migration344 = readFileSync(
  resolve(projectRoot, "supabase/migrations/344_channel_commercial_rls_hardening.sql"),
  "utf8",
);
const migration111 = readFileSync(
  resolve(projectRoot, "supabase/migrations/111_rbac_enforcement.sql"),
  "utf8",
);

const CHANNEL_KEY_TO_FEATURE = Object.freeze({
  whatsapp: "whatsapp_channel",
  messenger: "facebook_channel",
  facebook: "facebook_channel",
  instagram: "instagram_channel",
  email: "email_channel",
  sms: "sms_channel",
} as const);

function resolveChannelCommercialFeatureCode(channelKey: string | null | undefined): string | null {
  if (!channelKey?.trim()) return null;
  const normalized = channelKey.trim().toLowerCase();
  return CHANNEL_KEY_TO_FEATURE[normalized as keyof typeof CHANNEL_KEY_TO_FEATURE] ?? null;
}

function isNonCommercialChannelKey(channelKey: string): boolean {
  return channelKey.trim().toLowerCase() === "web_chat";
}

function companyChannelKeyCommercialEntitled(
  channelKey: string,
  enabledFeatures: ReadonlySet<string>,
): boolean {
  if (isNonCommercialChannelKey(channelKey)) return true;
  const feature = resolveChannelCommercialFeatureCode(channelKey);
  if (!feature) return false;
  return enabledFeatures.has(feature);
}

type SettingsScenario = {
  table: string;
  featureCode: string;
  rbac: boolean;
  entitled: boolean;
  cleanup?: boolean;
};

function settingsMutationAllowed(input: SettingsScenario): boolean {
  if (!input.rbac) return false;
  if (input.cleanup) return true;
  return input.entitled;
}

function companyChannelInsertAllowed(input: {
  rbacManage: boolean;
  sameCompany: boolean;
  channelKey: string;
  enabledFeatures: ReadonlySet<string>;
}): boolean {
  if (!input.rbacManage || !input.sameCompany) return false;
  return companyChannelKeyCommercialEntitled(input.channelKey, input.enabledFeatures);
}

describe("Precheck — migration independence", () => {
  it("344 uses is_feature_enabled helpers and does not require 343 permission rows", () => {
    assert.match(migration344, /internal\.is_feature_enabled/);
    assert.match(migration344, /Does NOT depend on migration 343/);
    assert.doesNotMatch(migration344, /feature_definition_permissions/);
    assert.doesNotMatch(migration344, /insert into public\.permissions/i);
  });

  it("343 preserved locally and untouched by 344", () => {
    assert.match(migration343, /343 — Channel permission commercial mapping/);
    assert.doesNotMatch(migration344, /343_channel_permission_commercial_mapping/);
  });
});

describe("Policy surface area", () => {
  const tables = [
    "company_channels",
    "company_whatsapp_settings",
    "company_email_settings",
    "company_messenger_settings",
    "company_instagram_settings",
  ] as const;

  for (const table of tables) {
    it(`updates policies for ${table}`, () => {
      assert.match(migration344, new RegExp(`on public\\.${table}`));
    });
  }

  it("uses RBAC on company_channels without omnichannel SKU substitution", () => {
    assert.doesNotMatch(migration344, /'omnichannel'/);
    assert.match(migration344, /user_has_permission\('channels\.manage'\)/);
    assert.match(
      migration344,
      /user_has_permission\('channels\.manage'\)[\s\S]*company_channel_id_commercial_entitled/,
    );
  });

  it("preserves company_channels SELECT policy from 111 (metadata visibility)", () => {
    assert.match(migration111, /company_channels_select/);
    assert.doesNotMatch(migration344, /company_channels_select/);
  });

  it("requires commercial on company_channels INSERT/UPDATE only", () => {
    assert.match(migration344, /company_channels_insert[\s\S]*company_channel_id_commercial_entitled/);
    assert.match(migration344, /company_channels_update[\s\S]*company_channel_id_commercial_entitled/);
    assert.match(migration344, /or is_enabled = false/);
    assert.match(migration344, /or deleted_at is not null/);
  });
});

describe("Commercial feature per settings table", () => {
  it("maps each credential table to the correct SKU", () => {
    assert.match(migration344, /company_whatsapp_settings[\s\S]*'whatsapp_channel'/);
    assert.match(migration344, /company_email_settings[\s\S]*'email_channel'/);
    assert.match(migration344, /company_messenger_settings[\s\S]*'facebook_channel'/);
    assert.match(migration344, /company_instagram_settings[\s\S]*'instagram_channel'/);
  });
});

describe("Security matrix (pure resolver + policy model)", () => {
  const waOnly = new Set(["whatsapp_channel"]);
  const emailOnly = new Set(["email_channel"]);
  const fbOnly = new Set(["facebook_channel"]);
  const igOnly = new Set(["instagram_channel"]);
  const omnichannelOnly = new Set(["omnichannel"]);

  it("A whatsapp entitled + RBAC → allowed", () => {
    assert.equal(
      companyChannelInsertAllowed({
        rbacManage: true,
        sameCompany: true,
        channelKey: "whatsapp",
        enabledFeatures: waOnly,
      }),
      true,
    );
    assert.equal(
      settingsMutationAllowed({
        table: "company_whatsapp_settings",
        featureCode: "whatsapp_channel",
        rbac: true,
        entitled: true,
      }),
      true,
    );
  });

  it("B whatsapp RBAC without entitlement → denied", () => {
    assert.equal(
      companyChannelInsertAllowed({
        rbacManage: true,
        sameCompany: true,
        channelKey: "whatsapp",
        enabledFeatures: new Set(),
      }),
      false,
    );
  });

  it("C omnichannel only does not grant WhatsApp transport", () => {
    assert.equal(
      companyChannelInsertAllowed({
        rbacManage: true,
        sameCompany: true,
        channelKey: "whatsapp",
        enabledFeatures: omnichannelOnly,
      }),
      false,
    );
    assert.equal(
      settingsMutationAllowed({
        table: "company_whatsapp_settings",
        featureCode: "whatsapp_channel",
        rbac: true,
        entitled: omnichannelOnly.has("whatsapp_channel"),
      }),
      false,
    );
  });

  it("D email entitled → allowed", () => {
    assert.equal(
      companyChannelInsertAllowed({
        rbacManage: true,
        sameCompany: true,
        channelKey: "email",
        enabledFeatures: emailOnly,
      }),
      true,
    );
  });

  it("E email without entitlement → denied", () => {
    assert.equal(
      companyChannelInsertAllowed({
        rbacManage: true,
        sameCompany: true,
        channelKey: "email",
        enabledFeatures: waOnly,
      }),
      false,
    );
  });

  it("F facebook entitled → allowed", () => {
    assert.equal(
      companyChannelInsertAllowed({
        rbacManage: true,
        sameCompany: true,
        channelKey: "messenger",
        enabledFeatures: fbOnly,
      }),
      true,
    );
  });

  it("G facebook without entitlement → denied", () => {
    assert.equal(
      companyChannelInsertAllowed({
        rbacManage: true,
        sameCompany: true,
        channelKey: "messenger",
        enabledFeatures: emailOnly,
      }),
      false,
    );
  });

  it("H instagram entitled → allowed", () => {
    assert.equal(
      companyChannelInsertAllowed({
        rbacManage: true,
        sameCompany: true,
        channelKey: "instagram",
        enabledFeatures: igOnly,
      }),
      true,
    );
  });

  it("I instagram without entitlement → denied", () => {
    assert.equal(
      companyChannelInsertAllowed({
        rbacManage: true,
        sameCompany: true,
        channelKey: "instagram",
        enabledFeatures: waOnly,
      }),
      false,
    );
  });

  it("J unknown/unmapped channel type → denied", () => {
    assert.equal(
      companyChannelInsertAllowed({
        rbacManage: true,
        sameCompany: true,
        channelKey: "telegram",
        enabledFeatures: omnichannelOnly,
      }),
      false,
    );
  });

  it("K cross-company access → denied", () => {
    assert.equal(
      companyChannelInsertAllowed({
        rbacManage: true,
        sameCompany: false,
        channelKey: "whatsapp",
        enabledFeatures: waOnly,
      }),
      false,
    );
  });

  it("L RBAC missing with entitlement → denied", () => {
    assert.equal(
      companyChannelInsertAllowed({
        rbacManage: false,
        sameCompany: true,
        channelKey: "whatsapp",
        enabledFeatures: waOnly,
      }),
      false,
    );
  });

  it("M commercial present but RBAC missing → denied", () => {
    assert.equal(
      settingsMutationAllowed({
        table: "company_email_settings",
        featureCode: "email_channel",
        rbac: false,
        entitled: true,
      }),
      false,
    );
  });

  it("N cleanup disable without entitlement → allowed", () => {
    assert.equal(
      settingsMutationAllowed({
        table: "company_whatsapp_settings",
        featureCode: "whatsapp_channel",
        rbac: true,
        entitled: false,
        cleanup: true,
      }),
      true,
    );
  });

  it("O no entitlement table mutations in migration", () => {
    assert.doesNotMatch(migration344, /company_feature_overrides/i);
    assert.doesNotMatch(migration344, /plan_features/i);
    assert.doesNotMatch(migration344, /company_subscriptions/i);
  });

  it("P omnichannel does not grant transport SKUs", () => {
    for (const key of ["whatsapp", "email", "messenger", "instagram", "sms"] as const) {
      assert.equal(
        companyChannelKeyCommercialEntitled(key, omnichannelOnly),
        false,
        key,
      );
    }
  });

  it("Q individual channel does not imply omnichannel", () => {
    assert.equal(omnichannelOnly.has("whatsapp_channel"), false);
    assert.equal(waOnly.has("omnichannel"), false);
  });
});

describe("343 compatibility", () => {
  it("344 RLS layer is independent from 343 permission catalog mappings", () => {
    assert.match(migration343, /feature_definition_permissions/);
    assert.doesNotMatch(migration344, /feature_definition_permissions/);
  });
});

describe("Safety — no side effects", () => {
  it("no provider or queue activity", () => {
    assert.doesNotMatch(migration344, /graph\.facebook/i);
    assert.doesNotMatch(migration344, /notification_queue/i);
    assert.doesNotMatch(migration344, /marketing_campaign/i);
  });
});
