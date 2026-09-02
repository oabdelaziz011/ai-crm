/**
 * B1.2 Part 1 — channel permission commercial mapping (migration 343).
 * Run: pnpm exec tsx --test artifacts/login-app/scripts/channel-permission-commercial-mapping.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  groupPermissionsByFeature,
  isPermissionAvailableForCompany,
} from "../src/lib/billing/feature-definition-permissions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");
const migration299 = readFileSync(
  resolve(projectRoot, "supabase/migrations/299_feature_definition_permissions.sql"),
  "utf8",
);
const migration302 = readFileSync(
  resolve(projectRoot, "supabase/migrations/302_refactor_company_feature_catalog.sql"),
  "utf8",
);
const migration342 = readFileSync(
  resolve(projectRoot, "supabase/migrations/342_campaigns_commercial_feature.sql"),
  "utf8",
);
const migration343 = readFileSync(
  resolve(projectRoot, "supabase/migrations/343_channel_permission_commercial_mapping.sql"),
  "utf8",
);

const WHATSAPP_MAPPINGS = [
  "ai.whatsapp.manage",
  "whatsapp.run",
  "whatsapp.view",
] as const;

const OMNICHANNEL_SAMPLE = [
  "channels.view",
  "channels.manage",
  "conversation.view",
  "channel.platform.dispatch",
] as const;

const CHANNEL_TRIPLES = {
  facebook_channel: ["messenger.view", "messenger.run", "ai.messenger.manage"],
  instagram_channel: ["instagram.view", "instagram.run", "ai.instagram.manage"],
  email_channel: ["email.view", "email.run", "ai.email.manage"],
  sms_channel: ["sms.view", "sms.run", "ai.sms.manage"],
} as const;

const GENERIC_PERMISSIONS = [
  "settings.edit",
  "channels.view",
  "channels.manage",
  "channel.platform.view",
  "channel.platform.route",
  "channel.platform.dispatch",
] as const;

function extractMappings(sql: string, featureCode: string): string[] {
  const pattern = new RegExp(`\\('${featureCode}',\\s*'([^']+)'\\)`, "g");
  const codes: string[] = [];
  for (const match of sql.matchAll(pattern)) {
    codes.push(match[1]!);
  }
  return [...new Set(codes)].sort();
}

describe("Precheck — migration sequence", () => {
  it("343 exists; live baseline remains 342 campaigns migration", () => {
    assert.match(migration342, /342 — Campaigns commercial feature/);
    assert.match(migration343, /343 — Channel permission commercial mapping/);
    assert.doesNotMatch(migration343, /insert into public\.company_feature_overrides/i);
    assert.doesNotMatch(migration343, /insert into public\.plan_features/i);
    assert.doesNotMatch(migration343, /company_subscriptions/i);
  });

  it("302 zero-map invariant remains historical; 343 adds mappings afterward", () => {
    assert.match(migration302, /facebook_channel', 'instagram_channel', 'email_channel', 'sms_channel'/);
    for (const feature of Object.keys(CHANNEL_TRIPLES)) {
      assert.doesNotMatch(
        migration302,
        new RegExp(`\\('${feature}',\\s*'[^']+'\\)`),
      );
    }
  });
});

describe("A/B — whatsapp_channel and omnichannel mappings unchanged", () => {
  it("whatsapp_channel triple preserved in 299; 343 does not alter it", () => {
    assert.deepEqual(extractMappings(migration299, "whatsapp_channel"), [...WHATSAPP_MAPPINGS].sort());
    assert.doesNotMatch(migration343, /\('whatsapp_channel',\s*'/);
  });

  it("omnichannel mappings untouched by 343", () => {
    for (const perm of OMNICHANNEL_SAMPLE) {
      assert.match(migration299, new RegExp(`\\('omnichannel', '${perm.replace(".", "\\.")}'\\)`));
    }
    assert.doesNotMatch(migration343, /\('omnichannel',\s*'/);
  });
});

describe("C–F — new channel-specific mappings", () => {
  for (const [feature, perms] of Object.entries(CHANNEL_TRIPLES)) {
    it(`${feature} maps to channel-specific permissions only`, () => {
      assert.deepEqual(extractMappings(migration343, feature), [...perms].sort());
    });
  }
});

describe("G — no generic permission mapped to all channel SKUs", () => {
  it("343 does not map shared inbox/settings permissions to channel features", () => {
    for (const generic of GENERIC_PERMISSIONS) {
      for (const feature of Object.keys(CHANNEL_TRIPLES)) {
        assert.doesNotMatch(
          migration343,
          new RegExp(`\\('${feature}',\\s*'${generic.replace(".", "\\.")}'\\)`),
        );
      }
    }
    assert.match(migration343, /generic permissions mapped to channel SKUs/);
  });
});

describe("H — zero-map / fail-open interaction (pure resolver)", () => {
  const rows = [
    ...Object.entries(CHANNEL_TRIPLES).flatMap(([feature, perms]) =>
      perms.map((permission_code) => ({ feature_code: feature, permission_code })),
    ),
    { feature_code: "whatsapp_channel", permission_code: "whatsapp.view" },
  ];
  const map = groupPermissionsByFeature(rows);

  it("mapped channel permission denied when feature OFF", () => {
    assert.equal(
      isPermissionAvailableForCompany("email.view", {
        isSuperAdmin: false,
        featurePermissions: map,
        isFeatureEnabled: () => false,
      }),
      false,
    );
    assert.equal(
      isPermissionAvailableForCompany("messenger.view", {
        isSuperAdmin: false,
        featurePermissions: map,
        isFeatureEnabled: (c) => c === "email_channel",
      }),
      false,
    );
  });

  it("mapped channel permission allowed only for entitled feature", () => {
    assert.equal(
      isPermissionAvailableForCompany("instagram.view", {
        isSuperAdmin: false,
        featurePermissions: map,
        isFeatureEnabled: (c) => c === "instagram_channel",
      }),
      true,
    );
  });

  it("unmapped legacy permission remains fail-open", () => {
    assert.equal(
      isPermissionAvailableForCompany("settings.edit", {
        isSuperAdmin: false,
        featurePermissions: map,
        isFeatureEnabled: () => false,
      }),
      true,
    );
  });
});

describe("I — migration idempotency markers", () => {
  it("uses on conflict for permissions and mappings", () => {
    assert.match(migration343, /on conflict \(code\) do update/);
    assert.match(migration343, /on conflict \(feature_code, permission_code\) do nothing/);
  });
});

describe("J/K — no entitlement mutation or provider calls", () => {
  it("does not mutate commercial grants or call providers", () => {
    assert.doesNotMatch(migration343, /graph\.facebook\.com/i);
    assert.doesNotMatch(migration343, /update public\.company_feature_overrides/i);
    assert.doesNotMatch(migration343, /delete from public\.company_feature_overrides/i);
    assert.doesNotMatch(migration343, /insert into public\.plan_features/i);
    assert.doesNotMatch(migration343, /notification_queue/i);
  });
});
