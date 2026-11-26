import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildWhatsAppEmbeddedSignupV4LaunchExtras,
  isWhatsAppCoexistenceEnabled,
  isWhatsAppEmbeddedSignupAutoSubscribeEnabled,
  isWhatsAppEmbeddedSignupCompanyAllowed,
  isWhatsAppEmbeddedSignupEnabled,
  META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV,
  META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID_ENV,
  readMetaEmbeddedSignupConfigIdForMode,
  readMetaEmbeddedSignupEnvConfig,
  WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS_ENV,
  WHATSAPP_EMBEDDED_SIGNUP_PROTOCOL_VERSION,
  WHATSAPP_EMBEDDED_SIGNUP_REGISTRATION_PIN_ENV,
} from "./whatsapp-embedded-signup-flags.js";
import { maybeSubscribeWabaToWebhook } from "./whatsapp-embedded-signup-waba-subscribe.js";
import {
  WhatsAppEmbeddedSignupError,
  __test,
  completeWhatsAppEmbeddedSignup,
  createWhatsAppEmbeddedSignupSession,
} from "./whatsapp-embedded-signup.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Valid UUID used by allowlist-gated tests. */
const TEST_COMPANY_ID = "11111111-1111-4111-8111-111111111111";

const ENV_KEYS = [
  "WHATSAPP_EMBEDDED_SIGNUP_ENABLED",
  "WHATSAPP_COEXISTENCE_ENABLED",
  "WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE",
  "WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE",
  "WHATSAPP_EMBEDDED_SIGNUP_REGISTER_PHONE",
  WHATSAPP_EMBEDDED_SIGNUP_REGISTRATION_PIN_ENV,
  WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS_ENV,
  "NODE_ENV",
  "META_EMBEDDED_SIGNUP_APP_ID",
  "META_EMBEDDED_SIGNUP_APP_SECRET",
  "META_EMBEDDED_SIGNUP_CONFIG_ID",
  META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV,
  META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID_ENV,
  "META_EMBEDDED_SIGNUP_STATE_SECRET",
  "META_EMBEDDED_SIGNUP_GRAPH_VERSION",
] as const;

const saved: Record<string, string | undefined> = {};

function snapshotEnv() {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function setMetaConfig() {
  // Must be a numeric Meta app id (Instagram Login-only IDs are rejected).
  process.env.META_EMBEDDED_SIGNUP_APP_ID = "1400885884891475";
  process.env.META_EMBEDDED_SIGNUP_APP_SECRET = "secret-xyz";
  process.env[META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV] = "cloud-config-111";
  process.env[META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID_ENV] = "coex-config-222";
  process.env.META_EMBEDDED_SIGNUP_STATE_SECRET = "state-secret";
  process.env[WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS_ENV] = TEST_COMPANY_ID;
}

function signTestState(
  overrides: Partial<{
    companyId: string;
    userId: string | null;
    nonce: string;
    exp: number;
    onboardingMode: "cloud_api_new" | "coexistence";
  }> = {},
) {
  return __test.signState(
    {
      companyId: overrides.companyId ?? TEST_COMPANY_ID,
      userId: overrides.userId ?? "user-1",
      nonce: overrides.nonce ?? "n1",
      exp: overrides.exp ?? Date.now() + 60_000,
      onboardingMode: overrides.onboardingMode ?? "cloud_api_new",
    },
    "state-secret",
  );
}

function emptySettingsClient(extra?: {
  existing?: Record<string, unknown>;
  duplicatePhone?: boolean;
  reclaimUpdates?: Array<Record<string, unknown>>;
}) {
  const existing = extra?.existing ?? {
    phone_number_id: "",
    business_account_id: "",
    has_access_token: false,
    has_webhook_verify_token: false,
    api_version: "v21.0",
    default_language: "en",
    max_retry_count: 3,
    webhook_callback_url: "https://webhook.valueor.org/api/webhooks/whatsapp",
  };
  const reclaimUpdates = extra?.reclaimUpdates;
  return {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name === "get_company_whatsapp_settings") {
        return { data: existing, error: null };
      }
      if (name === "upsert_company_whatsapp_settings") {
        return { data: args ?? {}, error: null };
      }
      if (name === "sync_whatsapp_channel_references") {
        return { data: null, error: null };
      }
      if (name === "record_whatsapp_connection_lifecycle_event") {
        return { data: "evt-reclaim", error: null };
      }
      return { data: null, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          neq: () => ({
            limit: async () => ({
              data: extra?.duplicatePhone
                ? [
                    {
                      company_id: "22222222-2222-4222-8222-222222222222",
                      phone_number_id: "999",
                      business_account_id: "waba-other",
                    },
                  ]
                : [],
              error: null,
            }),
          }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: (_col1: string, val1: unknown) => ({
          eq: async (_col2: string, val2: unknown) => {
            reclaimUpdates?.push({
              payload,
              filter_company_id: val1,
              filter_phone_number_id: val2,
            });
            return { error: null };
          },
        }),
      }),
      upsert: async () => ({ error: null }),
    }),
  };
}

afterEach(() => {
  restoreEnv();
});

describe("whatsapp-embedded-signup-flags", () => {
  it("defaults all flags to false", () => {
    snapshotEnv();
    for (const key of ENV_KEYS) delete process.env[key];
    assert.equal(isWhatsAppEmbeddedSignupEnabled(), false);
    assert.equal(isWhatsAppCoexistenceEnabled(), false);
    assert.equal(isWhatsAppEmbeddedSignupAutoSubscribeEnabled(), false);
    assert.equal(readMetaEmbeddedSignupEnvConfig(), null);
    assert.equal(isWhatsAppEmbeddedSignupCompanyAllowed(TEST_COMPANY_ID), false);
  });

  it("reads Meta env config without exposing incomplete secrets", () => {
    snapshotEnv();
    setMetaConfig();
    const cfg = readMetaEmbeddedSignupEnvConfig();
    assert.ok(cfg);
    assert.equal(cfg?.appId, "1400885884891475");
    assert.equal(cfg?.appSecret, "secret-xyz");
    assert.equal(
      readMetaEmbeddedSignupConfigIdForMode("cloud_api_new"),
      "cloud-config-111",
    );
    assert.equal(
      readMetaEmbeddedSignupConfigIdForMode("coexistence"),
      "coex-config-222",
    );
  });

  it("does not cross-fall back between Cloud API and Coexistence config IDs", () => {
    snapshotEnv();
    process.env.META_EMBEDDED_SIGNUP_APP_ID = "1400885884891475";
    process.env.META_EMBEDDED_SIGNUP_APP_SECRET = "secret-xyz";
    process.env[META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV] = "cloud-only";
    delete process.env[META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID_ENV];
    delete process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;

    assert.equal(readMetaEmbeddedSignupConfigIdForMode("cloud_api_new"), "cloud-only");
    assert.equal(readMetaEmbeddedSignupConfigIdForMode("coexistence"), null);

    delete process.env[META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV];
    process.env[META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID_ENV] = "coex-only";
    assert.equal(readMetaEmbeddedSignupConfigIdForMode("cloud_api_new"), null);
    assert.equal(readMetaEmbeddedSignupConfigIdForMode("coexistence"), "coex-only");
  });

  it("builds v4 launch extras without sessionInfoVersion or version", () => {
    const cloud = buildWhatsAppEmbeddedSignupV4LaunchExtras({
      onboardingMode: "cloud_api_new",
      featureType: null,
    });
    assert.deepEqual(cloud, { setup: {} });
    assert.equal("sessionInfoVersion" in cloud, false);
    assert.equal("version" in cloud, false);

    const coex = buildWhatsAppEmbeddedSignupV4LaunchExtras({
      onboardingMode: "coexistence",
      featureType: "whatsapp_business_app_onboarding",
    });
    assert.deepEqual(coex, {
      setup: {},
      featureType: "whatsapp_business_app_onboarding",
    });
    assert.equal("sessionInfoVersion" in coex, false);
  });
});

describe("whatsapp-embedded-signup-waba-subscribe", () => {
  it("no-ops when auto-subscribe is disabled", async () => {
    snapshotEnv();
    delete process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE;
    const result = await maybeSubscribeWabaToWebhook({
      wabaId: "waba",
      accessToken: "token",
      callbackUrl: "https://webhook.example.test/api/webhooks/whatsapp",
      graphApiVersion: "v21.0",
      targetAppId: "app-123",
    });
    assert.equal(result.status, "skipped_flag_off");
    assert.equal(result.attempted, false);
    assert.equal(result.ok, false);
  });
});

describe("whatsapp-embedded-signup service", () => {
  it("rejects session when feature flag is off", async () => {
    snapshotEnv();
    delete process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED;
    setMetaConfig();
    await assert.rejects(
      () => createWhatsAppEmbeddedSignupSession({ companyId: TEST_COMPANY_ID, userId: "u1" }),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_DISABLED",
    );
  });

  it("rejects session for companies outside the allowlist", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    setMetaConfig();
    await assert.rejects(
      () =>
        createWhatsAppEmbeddedSignupSession({
          companyId: "22222222-2222-4222-8222-222222222222",
          userId: "u1",
        }),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_COMPANY_NOT_ALLOWED",
    );
  });

  it("rejects invalid state signature", () => {
    snapshotEnv();
    const state = signTestState();
    assert.throws(
      () => __test.verifyAndParseState(state + "x", "state-secret", TEST_COMPANY_ID, Date.now()),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_STATE_INVALID",
    );
  });

  it("rejects cross-company state", () => {
    snapshotEnv();
    const state = signTestState();
    assert.throws(
      () =>
        __test.verifyAndParseState(
          state,
          "state-secret",
          "22222222-2222-4222-8222-222222222222",
          Date.now(),
        ),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_STATE_COMPANY_MISMATCH",
    );
  });

  it("rejects existing connection without replaceExisting", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    setMetaConfig();

    const state = signTestState();
    const client = emptySettingsClient({
      existing: {
        phone_number_id: "111",
        business_account_id: "222",
        has_access_token: true,
        has_webhook_verify_token: true,
        api_version: "v21.0",
        default_language: "en",
        max_retry_count: 3,
        webhook_callback_url: "",
      },
    });

    await assert.rejects(
      () =>
        completeWhatsAppEmbeddedSignup(
          {
            companyId: TEST_COMPANY_ID,
            userId: "user-1",
            code: "auth-code",
            state,
            phoneNumberId: "999",
            businessAccountId: "888",
            replaceExisting: false,
          },
          { client: client as never, stateSecret: "state-secret" },
        ),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_CONNECTION_EXISTS",
    );
  });

  it("idempotently replays complete when phone+waba already match", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    setMetaConfig();

    const state = signTestState();
    const client = emptySettingsClient({
      existing: {
        phone_number_id: "999",
        business_account_id: "888",
        has_access_token: true,
        has_webhook_verify_token: true,
        api_version: "v21.0",
        default_language: "en",
        max_retry_count: 3,
        webhook_callback_url: "https://webhook.valueor.org/api/webhooks/whatsapp",
      },
    });

    let exchanged = false;
    const fetchImpl: typeof fetch = async () => {
      exchanged = true;
      return new Response("{}", { status: 500 });
    };

    const result = await completeWhatsAppEmbeddedSignup(
      {
        companyId: TEST_COMPANY_ID,
        userId: "user-1",
        code: "auth-code-replay",
        state,
        phoneNumberId: "999",
        businessAccountId: "888",
        replaceExisting: false,
      },
      { client: client as never, stateSecret: "state-secret", fetchImpl },
    );

    assert.equal(result.ok, true);
    assert.equal(result.idempotentReplay, true);
    assert.equal(result.credentialStatus, "already_persisted");
    assert.equal(exchanged, false);
  });

  it("reclaims duplicate phone_number_id from another company then persists", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    setMetaConfig();

    const state = signTestState();
    const reclaimUpdates: Array<Record<string, unknown>> = [];
    const client = emptySettingsClient({ duplicatePhone: true, reclaimUpdates });

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("oauth/access_token")) {
        return new Response(JSON.stringify({ access_token: "EAAB-reclaim-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: "999" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await completeWhatsAppEmbeddedSignup(
      {
        companyId: TEST_COMPANY_ID,
        userId: "user-1",
        code: "auth-code",
        state,
        phoneNumberId: "999",
        businessAccountId: "888",
      },
      { client: client as never, stateSecret: "state-secret", fetchImpl },
    );

    assert.equal(result.ok, true);
    assert.equal(result.phoneNumberId, "999");
    assert.equal(reclaimUpdates.length, 1);
    assert.equal(reclaimUpdates[0]?.filter_company_id, "22222222-2222-4222-8222-222222222222");
    assert.equal(reclaimUpdates[0]?.filter_phone_number_id, "999");
    const payload = reclaimUpdates[0]?.payload as Record<string, unknown>;
    assert.equal(payload?.enabled, false);
    assert.equal(payload?.phone_number_id, "");
    assert.equal(payload?.access_token_hint, "");
    assert.equal(payload?.webhook_verify_token_hint, "");
    assert.equal(payload?.app_secret_hint, "");
  });

  it("persists via upsert RPC + sync + skips auto-subscribe", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    delete process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE;
    setMetaConfig();

    const state = signTestState();
    const upsertPayloads: Record<string, unknown>[] = [];
    const base = emptySettingsClient();
    const client = {
      ...base,
      rpc: async (name: string, args?: Record<string, unknown>) => {
        if (name === "upsert_company_whatsapp_settings") {
          upsertPayloads.push(args ?? {});
        }
        return base.rpc(name, args);
      },
    };

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("oauth/access_token")) {
        return new Response(JSON.stringify({ access_token: "EAAB-test-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // connection probe
      return new Response(JSON.stringify({ id: "1214681355059951" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await completeWhatsAppEmbeddedSignup(
      {
        companyId: TEST_COMPANY_ID,
        userId: "user-1",
        code: "auth-code",
        state,
        phoneNumberId: "1214681355059951",
        businessAccountId: "1584022663181525",
      },
      { client: client as never, stateSecret: "state-secret", fetchImpl },
    );

    assert.equal(result.ok, true);
    assert.equal(result.credentialStatus, "persisted");
    assert.equal(result.webhookSubscriptionStatus, "skipped_flag_off");
    assert.equal(result.fullyOnboarded, false);
    assert.equal(result.phoneNumberId, "1214681355059951");
    assert.equal(upsertPayloads[0]?.p_access_token, "EAAB-test-token");
    assert.equal(upsertPayloads[0]?.p_phone_number_id, "1214681355059951");
    assert.equal(upsertPayloads[0]?.p_app_secret, "secret-xyz");
  });

  it("creates cloud_api_new v4 session with launchExtras and without coexistence featureType", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    setMetaConfig();

    const session = await createWhatsAppEmbeddedSignupSession({
      companyId: TEST_COMPANY_ID,
      userId: "user-1",
      onboardingMode: "cloud_api_new",
    });

    assert.equal(session.onboardingMode, "cloud_api_new");
    assert.equal(session.featureType, null);
    assert.equal(session.configId, "cloud-config-111");
    assert.equal(session.embeddedSignupVersion, WHATSAPP_EMBEDDED_SIGNUP_PROTOCOL_VERSION);
    assert.deepEqual(session.launchExtras, { setup: {} });
    assert.equal("sessionInfoVersion" in session.launchExtras, false);
  });

  it("fails clearly when Cloud API config ID is missing (no Coexistence fallback)", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    process.env.META_EMBEDDED_SIGNUP_APP_ID = "1400885884891475";
    process.env.META_EMBEDDED_SIGNUP_APP_SECRET = "secret-xyz";
    process.env.META_EMBEDDED_SIGNUP_STATE_SECRET = "state-secret";
    process.env[WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS_ENV] = TEST_COMPANY_ID;
    delete process.env[META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV];
    process.env[META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID_ENV] = "coex-config-222";

    await assert.rejects(
      () =>
        createWhatsAppEmbeddedSignupSession({
          companyId: TEST_COMPANY_ID,
          userId: "user-1",
          onboardingMode: "cloud_api_new",
        }),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError &&
        err.code === "ES_META_CONFIG_ID_MISSING" &&
        err.message.includes(META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV) &&
        /feature remains closed/i.test(err.message) &&
        !err.message.includes("coex-config-222"),
    );
  });

  it("rejects coexistence session when coexistence flag is off", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    delete process.env.WHATSAPP_COEXISTENCE_ENABLED;
    setMetaConfig();

    await assert.rejects(
      () =>
        createWhatsAppEmbeddedSignupSession({
          companyId: TEST_COMPANY_ID,
          userId: "user-1",
          onboardingMode: "coexistence",
        }),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_COEXISTENCE_DISABLED",
    );
  });

  it("creates coexistence session with Meta featureType when explicitly enabled", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    process.env.WHATSAPP_COEXISTENCE_ENABLED = "true";
    setMetaConfig();

    const session = await createWhatsAppEmbeddedSignupSession({
      companyId: TEST_COMPANY_ID,
      userId: "user-1",
      onboardingMode: "coexistence",
    });

    assert.equal(session.onboardingMode, "coexistence");
    assert.equal(session.featureType, "whatsapp_business_app_onboarding");
    assert.equal(session.configId, "coex-config-222");
    assert.deepEqual(session.launchExtras, {
      setup: {},
      featureType: "whatsapp_business_app_onboarding",
    });
  });

  it("rejects register-phone when PIN is missing (never hardcodes 000000)", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    process.env.WHATSAPP_EMBEDDED_SIGNUP_REGISTER_PHONE = "true";
    delete process.env[WHATSAPP_EMBEDDED_SIGNUP_REGISTRATION_PIN_ENV];
    setMetaConfig();

    const state = signTestState();
    const client = emptySettingsClient();
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ access_token: "EAAB-test-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    await assert.rejects(
      () =>
        completeWhatsAppEmbeddedSignup(
          {
            companyId: TEST_COMPANY_ID,
            userId: "user-1",
            code: "auth-code",
            state,
            phoneNumberId: "1214681355059951",
            businessAccountId: "1584022663181525",
          },
          { client: client as never, stateSecret: "state-secret", fetchImpl },
        ),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_REGISTER_PIN_MISSING",
    );
  });

  it("surfaces phone registration Graph failures instead of swallowing them", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    process.env.WHATSAPP_EMBEDDED_SIGNUP_REGISTER_PHONE = "true";
    process.env[WHATSAPP_EMBEDDED_SIGNUP_REGISTRATION_PIN_ENV] = "123456";
    setMetaConfig();

    const state = signTestState();
    const client = emptySettingsClient();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("oauth/access_token")) {
        return new Response(JSON.stringify({ access_token: "EAAB-test-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/register")) {
        return new Response(
          JSON.stringify({ error: { message: "Invalid PIN for registration" } }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ id: "1214681355059951" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await assert.rejects(
      () =>
        completeWhatsAppEmbeddedSignup(
          {
            companyId: TEST_COMPANY_ID,
            userId: "user-1",
            code: "auth-code",
            state,
            phoneNumberId: "1214681355059951",
            businessAccountId: "1584022663181525",
          },
          { client: client as never, stateSecret: "state-secret", fetchImpl },
        ),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError &&
        err.code === "ES_REGISTER_FAILED" &&
        err.message.includes("Invalid PIN"),
    );
  });

  it("rejects state/onboarding mode mismatch", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    setMetaConfig();

    const state = signTestState({ onboardingMode: "cloud_api_new" });
    const client = emptySettingsClient();

    await assert.rejects(
      () =>
        completeWhatsAppEmbeddedSignup(
          {
            companyId: TEST_COMPANY_ID,
            userId: "user-1",
            code: "auth-code",
            state,
            phoneNumberId: "",
            businessAccountId: "waba-1",
            coexistenceEligible: true,
          },
          { client: client as never, stateSecret: "state-secret" },
        ),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_STATE_MODE_MISMATCH",
    );
  });
});

describe("whatsapp-embedded-signup regression contracts", () => {
  it("does not hardcode registration PIN 000000", () => {
    const service = readFileSync(join(here, "whatsapp-embedded-signup.ts"), "utf8");
    assert.doesNotMatch(service, /pin:\s*"000000"/);
    assert.match(service, /WHATSAPP_EMBEDDED_SIGNUP_REGISTRATION_PIN/);
  });

  it("keeps inbound webhook and outbound WhatsApp routes independent of ES register/subscribe", () => {
    const webhooks = readFileSync(join(here, "..", "routes", "webhooks.ts"), "utf8");
    const whatsapp = readFileSync(join(here, "..", "routes", "whatsapp.ts"), "utf8");
    assert.match(webhooks, /router\.(get|post)\("\/whatsapp"/);
    assert.match(webhooks, /processWhatsAppWebhookPost/);
    assert.doesNotMatch(webhooks, /completeWhatsAppEmbeddedSignup/);
    assert.doesNotMatch(whatsapp, /sessionInfoVersion\s*:/);
    assert.match(whatsapp, /test-connection|settings/i);
  });
});
