import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  isWhatsAppCoexistenceEnabled,
  isWhatsAppEmbeddedSignupAutoSubscribeEnabled,
  isWhatsAppEmbeddedSignupEnabled,
  readMetaEmbeddedSignupEnvConfig,
} from "./whatsapp-embedded-signup-flags.js";
import { maybeSubscribeWabaToWebhook } from "./whatsapp-embedded-signup-waba-subscribe.js";
import {
  WhatsAppEmbeddedSignupError,
  __test,
  completeWhatsAppEmbeddedSignup,
  createWhatsAppEmbeddedSignupSession,
} from "./whatsapp-embedded-signup.js";

const ENV_KEYS = [
  "WHATSAPP_EMBEDDED_SIGNUP_ENABLED",
  "WHATSAPP_COEXISTENCE_ENABLED",
  "WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE",
  "WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE",
  "NODE_ENV",
  "META_EMBEDDED_SIGNUP_APP_ID",
  "META_EMBEDDED_SIGNUP_APP_SECRET",
  "META_EMBEDDED_SIGNUP_CONFIG_ID",
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
  process.env.META_EMBEDDED_SIGNUP_APP_ID = "app-123";
  process.env.META_EMBEDDED_SIGNUP_APP_SECRET = "secret-xyz";
  process.env.META_EMBEDDED_SIGNUP_CONFIG_ID = "config-456";
  process.env.META_EMBEDDED_SIGNUP_STATE_SECRET = "state-secret";
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
  });

  it("reads Meta env config without exposing incomplete secrets", () => {
    snapshotEnv();
    setMetaConfig();
    const cfg = readMetaEmbeddedSignupEnvConfig();
    assert.ok(cfg);
    assert.equal(cfg?.appId, "app-123");
    assert.equal(cfg?.configId, "config-456");
    assert.equal(cfg?.appSecret, "secret-xyz");
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
      () => createWhatsAppEmbeddedSignupSession({ companyId: "c1", userId: "u1" }),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_DISABLED",
    );
  });

  it("rejects invalid state signature", () => {
    snapshotEnv();
    const secret = "state-secret";
    const state = __test.signState(
      { companyId: "c1", userId: "u1", nonce: "abc", exp: Date.now() + 60_000 },
      secret,
    );
    assert.throws(
      () => __test.verifyAndParseState(state + "x", secret, "c1", Date.now()),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_STATE_INVALID",
    );
  });

  it("rejects cross-company state", () => {
    snapshotEnv();
    const secret = "state-secret";
    const state = __test.signState(
      { companyId: "c1", userId: "u1", nonce: "abc", exp: Date.now() + 60_000 },
      secret,
    );
    assert.throws(
      () => __test.verifyAndParseState(state, secret, "other-company", Date.now()),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_STATE_COMPANY_MISMATCH",
    );
  });

  it("rejects existing connection without replaceExisting", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    setMetaConfig();

    const secret = "state-secret";
    const state = __test.signState(
      { companyId: "company-1", userId: "user-1", nonce: "n1", exp: Date.now() + 60_000 },
      secret,
    );

    const client = {
      rpc: async (name: string) => {
        if (name === "get_company_whatsapp_settings") {
          return {
            data: {
              phone_number_id: "111",
              business_account_id: "222",
              has_access_token: true,
              has_webhook_verify_token: true,
              api_version: "v21.0",
              default_language: "en",
              max_retry_count: 3,
              webhook_callback_url: "",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            neq: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
        upsert: async () => ({ error: null }),
      }),
    };

    await assert.rejects(
      () =>
        completeWhatsAppEmbeddedSignup(
          {
            companyId: "company-1",
            userId: "user-1",
            code: "auth-code",
            state,
            phoneNumberId: "999",
            businessAccountId: "888",
            replaceExisting: false,
          },
          { client: client as never, stateSecret: secret },
        ),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_CONNECTION_EXISTS",
    );
  });

  it("rejects duplicate phone_number_id owned by another company", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    setMetaConfig();

    const secret = "state-secret";
    const state = __test.signState(
      { companyId: "company-1", userId: "user-1", nonce: "n1", exp: Date.now() + 60_000 },
      secret,
    );

    const client = {
      rpc: async (name: string) => {
        if (name === "get_company_whatsapp_settings") {
          return {
            data: {
              phone_number_id: "",
              business_account_id: "",
              has_access_token: false,
              has_webhook_verify_token: false,
              api_version: "v21.0",
              default_language: "en",
              max_retry_count: 3,
              webhook_callback_url: "",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            neq: () => ({
              limit: async () => ({
                data: [{ company_id: "other", phone_number_id: "999" }],
                error: null,
              }),
            }),
          }),
        }),
        upsert: async () => ({ error: null }),
      }),
    };

    await assert.rejects(
      () =>
        completeWhatsAppEmbeddedSignup(
          {
            companyId: "company-1",
            userId: "user-1",
            code: "auth-code",
            state,
            phoneNumberId: "999",
            businessAccountId: "888",
          },
          { client: client as never, stateSecret: secret },
        ),
      (err: unknown) =>
        err instanceof WhatsAppEmbeddedSignupError && err.code === "ES_PHONE_IN_USE",
    );
  });

  it("persists via upsert RPC + sync + skips auto-subscribe", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED = "true";
    delete process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE;
    setMetaConfig();

    const secret = "state-secret";
    const state = __test.signState(
      { companyId: "company-1", userId: "user-1", nonce: "n1", exp: Date.now() + 60_000 },
      secret,
    );

    const rpcs: string[] = [];
    const upsertPayloads: Record<string, unknown>[] = [];

    const client = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        rpcs.push(name);
        if (name === "get_company_whatsapp_settings") {
          return {
            data: {
              phone_number_id: "",
              business_account_id: "",
              has_access_token: false,
              has_webhook_verify_token: false,
              api_version: "v21.0",
              default_language: "en",
              max_retry_count: 3,
              webhook_callback_url: "https://webhook.valueor.org/api/webhooks/whatsapp",
            },
            error: null,
          };
        }
        if (name === "upsert_company_whatsapp_settings") {
          upsertPayloads.push(args ?? {});
          return { data: {}, error: null };
        }
        if (name === "sync_whatsapp_channel_references") {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            neq: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
        upsert: async () => ({ error: null }),
      }),
    };

    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ access_token: "EAAB-test-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const result = await completeWhatsAppEmbeddedSignup(
      {
        companyId: "company-1",
        userId: "user-1",
        code: "auth-code",
        state,
        phoneNumberId: "1214681355059951",
        businessAccountId: "1584022663181525",
      },
      { client: client as never, stateSecret: secret, fetchImpl },
    );

    assert.equal(result.ok, true);
    assert.equal(result.credentialStatus, "persisted");
    assert.equal(result.webhookSubscriptionStatus, "skipped_flag_off");
    assert.equal(result.fullyOnboarded, false);
    assert.equal(result.phoneNumberId, "1214681355059951");
    assert.equal(result.subscription.status, "skipped_flag_off");
    assert.equal(result.subscription.attempted, false);
    assert.ok(rpcs.includes("upsert_company_whatsapp_settings"));
    assert.ok(rpcs.includes("sync_whatsapp_channel_references"));
    assert.equal(upsertPayloads[0]?.p_access_token, "EAAB-test-token");
    assert.equal(upsertPayloads[0]?.p_phone_number_id, "1214681355059951");
    assert.equal(upsertPayloads[0]?.p_business_account_id, "1584022663181525");
    // Empty app secret preserves existing encrypted secret semantics.
    assert.equal(upsertPayloads[0]?.p_app_secret, "");
  });
});
