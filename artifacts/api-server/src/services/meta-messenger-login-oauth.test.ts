import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMetaMessengerLoginReadiness,
  completeMetaMessengerLogin,
  handleMetaMessengerLoginCallback,
  listPendingMessengerPages,
  MetaMessengerLoginError,
  softDisconnectMetaMessengerLogin,
  startMetaMessengerLogin,
  __metaMessengerLoginTest,
} from "./meta-messenger-login-oauth.js";
import {
  createMetaOauthState,
  resolveMetaOauthStateSecret,
  verifyMetaOauthState,
} from "./meta-oauth-state.js";

const DEMO = "d0000010-0001-4001-8001-000000000002";
const OTHER = "d0000010-0001-4001-8001-000000000099";

function withMessengerEnv(run: () => Promise<void> | void) {
  const prev = {
    enabled: process.env.META_MESSENGER_OAUTH_ENABLED,
    allow: process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS,
    app: process.env.META_MESSENGER_OAUTH_APP_ID,
    secret: process.env.META_MESSENGER_OAUTH_APP_SECRET,
    base: process.env.META_OAUTH_PUBLIC_API_BASE_URL,
    state: process.env.META_MESSENGER_OAUTH_STATE_SECRET,
    login: process.env.LOGIN_APP_URL,
  };
  process.env.META_MESSENGER_OAUTH_ENABLED = "true";
  process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS = DEMO;
  process.env.META_MESSENGER_OAUTH_APP_ID = "1400885884891475";
  process.env.META_MESSENGER_OAUTH_APP_SECRET = "fb-app-secret";
  process.env.META_OAUTH_PUBLIC_API_BASE_URL = "http://127.0.0.1:3010";
  process.env.META_MESSENGER_OAUTH_STATE_SECRET = "unit-msl-state";
  process.env.LOGIN_APP_URL = "http://localhost:5180";
  return Promise.resolve(run()).finally(() => {
    process.env.META_MESSENGER_OAUTH_ENABLED = prev.enabled;
    process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS = prev.allow;
    process.env.META_MESSENGER_OAUTH_APP_ID = prev.app;
    process.env.META_MESSENGER_OAUTH_APP_SECRET = prev.secret;
    process.env.META_OAUTH_PUBLIC_API_BASE_URL = prev.base;
    process.env.META_MESSENGER_OAUTH_STATE_SECRET = prev.state;
    process.env.LOGIN_APP_URL = prev.login;
  });
}

describe("meta-messenger-login-oauth", () => {
  it("signs company-bound messenger state", () => {
    const secret = "unit-msl-secret";
    const now = Date.now();
    const state = createMetaOauthState({
      companyId: DEMO,
      userId: null,
      flow: __metaMessengerLoginTest.META_MESSENGER_LOGIN_FLOW,
      secret,
      nowMs: now,
    });
    const parsed = verifyMetaOauthState(
      state,
      secret,
      __metaMessengerLoginTest.META_MESSENGER_LOGIN_FLOW,
      now,
      DEMO,
    );
    assert.equal(parsed.flow, __metaMessengerLoginTest.META_MESSENGER_LOGIN_FLOW);
    assert.throws(
      () =>
        verifyMetaOauthState(
          state,
          secret,
          __metaMessengerLoginTest.META_MESSENGER_LOGIN_FLOW,
          now,
          OTHER,
        ),
      (err: unknown) =>
        err instanceof Error && (err as { code?: string }).code === "META_OAUTH_STATE_COMPANY_MISMATCH",
    );
  });

  it("builds Facebook dialog authorize URL with required pages scopes", async () => {
    await withMessengerEnv(() => {
      const session = startMetaMessengerLogin({ companyId: DEMO, userId: null });
      assert.match(session.authorizeUrl, /facebook\.com\/v21\.0\/dialog\/oauth/);
      assert.match(session.authorizeUrl, /pages_show_list/);
      assert.match(session.authorizeUrl, /pages_messaging/);
      assert.match(session.authorizeUrl, /pages_manage_metadata/);
      assert.match(session.authorizeUrl, /pages_read_engagement/);
      assert.equal(session.redirectUri, "http://127.0.0.1:3010/api/oauth/messenger/callback");
      assert.ok(!JSON.stringify(session).includes("fb-app-secret"));
      assert.match(session.authorizeUrl, /client_id=1400885884891475/);
    });
  });

  it("exchanges short-lived token for long-lived before listing pages", async () => {
    await withMessengerEnv(async () => {
      const urls: string[] = [];
      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("/oauth/access_token") && url.includes("fb_exchange_token")) {
          return new Response(JSON.stringify({ access_token: "long-lived-user" }), { status: 200 });
        }
        if (url.includes("/oauth/access_token")) {
          return new Response(JSON.stringify({ access_token: "short-lived-user" }), { status: 200 });
        }
        if (url.includes("/me/accounts")) {
          assert.match(url, /long-lived-user/);
          return new Response(
            JSON.stringify({
              data: [{ id: "page-1", name: "Demo Page", access_token: "page-token-1" }],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), {
          status: 500,
        });
      };

      const secret = resolveMetaOauthStateSecret("unit-msl-state");
      const state = createMetaOauthState({
        companyId: DEMO,
        userId: "u1",
        flow: __metaMessengerLoginTest.META_MESSENGER_LOGIN_FLOW,
        secret,
      });
      const client = {
        rpc: async () => ({ error: null }),
        from: () => ({
          upsert: async () => ({ error: null }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          update: () => ({ eq: async () => ({ error: null }) }),
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }),
      };

      try {
        const cb = await handleMetaMessengerLoginCallback({
          code: "fb-code",
          state,
          error: null,
          errorReason: null,
          deps: { client: client as never, fetchImpl },
        });
        assert.match(cb.redirectUrl, /messenger_oauth=select_page/);
        assert.ok(urls.some((u) => u.includes("fb_exchange_token")));
        assert.ok(urls.some((u) => u.includes("/me/accounts") && u.includes("long-lived-user")));
      } finally {
        await __metaMessengerLoginTest.clearPending({ state });
        __metaMessengerLoginTest.clearMemory();
      }
    });
  });

  it("callback caches pages and complete preserves verify token on reconnect", async () => {
    await withMessengerEnv(async () => {
      const secret = resolveMetaOauthStateSecret("unit-msl-state");
      const state = createMetaOauthState({
        companyId: DEMO,
        userId: "u1",
        flow: __metaMessengerLoginTest.META_MESSENGER_LOGIN_FLOW,
        secret,
      });

      const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const client = {
        rpc: async (name: string, args: Record<string, unknown>) => {
          rpcCalls.push({ name, args });
          return { error: null };
        },
        from: () => ({
          upsert: async () => ({ error: null }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { webhook_verify_token_encrypted: "enc-existing" },
                error: null,
              }),
            }),
          }),
        }),
      };

      const fetchImpl: typeof fetch = async (input, init) => {
        const url = String(input);
        if (url.includes("/oauth/access_token")) {
          return new Response(JSON.stringify({ access_token: "user-token" }), { status: 200 });
        }
        if (url.includes("/me/accounts")) {
          return new Response(
            JSON.stringify({
              data: [
                { id: "page-1", name: "Demo Page", access_token: "page-token-1" },
                { id: "page-2", name: "Other Page", access_token: "page-token-2" },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/subscribed_apps") && (!init?.method || init.method === "GET")) {
          return new Response(
            JSON.stringify({
              data: [{ subscribed_fields: ["messages", "messaging_postbacks"] }],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/subscribed_apps") && init?.method === "POST") {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (url.includes("page-1") && !url.includes("subscribed_apps")) {
          return new Response(JSON.stringify({ id: "page-1", name: "Demo Page" }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), {
          status: 500,
        });
      };

      try {
        const cb = await handleMetaMessengerLoginCallback({
          code: "fb-code",
          state,
          error: null,
          errorReason: null,
          deps: { client: client as never, fetchImpl },
        });
        assert.match(cb.redirectUrl, /messenger_oauth=select_page/);
        assert.match(cb.redirectUrl, /state=/);

        const pending = await listPendingMessengerPages({
          companyId: DEMO,
          state,
          deps: { client: client as never },
        });
        assert.equal(pending.pages.length, 2);
        assert.ok(!JSON.stringify(pending).includes("page-token"));

        await assert.rejects(
          () =>
            listPendingMessengerPages({
              companyId: OTHER,
              state,
              deps: { client: client as never },
            }),
          (err: unknown) =>
            err instanceof MetaMessengerLoginError &&
            (err.code === "MSL_PENDING_COMPANY_MISMATCH" ||
              err.code === "META_OAUTH_PENDING_COMPANY_MISMATCH" ||
              err.code === "META_OAUTH_STATE_COMPANY_MISMATCH" ||
              err.code === "MSL_COMPANY_NOT_ALLOWED"),
        );

        const done = await completeMetaMessengerLogin({
          companyId: DEMO,
          state,
          pageId: "page-1",
          deps: { client: client as never, fetchImpl },
        });
        assert.equal(done.ok, true);
        assert.equal(done.pageId, "page-1");
        assert.equal(done.pageName, "Demo Page");
        assert.equal(done.connected, true);
        assert.equal(rpcCalls[0]?.name, "upsert_company_messenger_settings");
        assert.equal(rpcCalls[0]?.args.p_company_id, DEMO);
        assert.equal(rpcCalls[0]?.args.p_access_token, "page-token-1");
        assert.equal(rpcCalls[0]?.args.p_page_id, "page-1");
        // Empty string preserves existing encrypted verify token via whatsapp_is_unchanged_secret.
        assert.equal(rpcCalls[0]?.args.p_webhook_verify_token, "");
      } finally {
        await __metaMessengerLoginTest.clearPending({ state });
        __metaMessengerLoginTest.clearMemory();
      }
    });
  });

  it("disconnect best-effort unsubscribes page webhooks", async () => {
    await withMessengerEnv(async () => {
      const methods: string[] = [];
      const fetchImpl: typeof fetch = async (_input, init) => {
        methods.push(String(init?.method ?? "GET"));
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };
      const client = {
        rpc: async (name: string) => {
          if (name === "get_company_messenger_settings_decrypted") {
            return { data: { access_token: "page-token" }, error: null };
          }
          return { error: null };
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  page_id: "page-1",
                  api_version: "v21.0",
                  access_token_encrypted: "enc",
                  credential_source: "oauth",
                  enabled: true,
                },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      };

      const result = await softDisconnectMetaMessengerLogin({
        companyId: DEMO,
        confirmClearCredentials: true,
        deps: { client: client as never, fetchImpl },
      });
      assert.equal(result.ok, true);
      assert.equal(result.softDisconnected, true);
      assert.equal(result.metaRevoked, true);
      assert.equal(result.clearedCredentials, true);
      assert.ok(methods.includes("DELETE"));
    });
  });

  it("reports readiness without secrets", () => {
    const prevEnabled = process.env.META_MESSENGER_OAUTH_ENABLED;
    const prevAllow = process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS;
    const prevPagesAllow = process.env.META_PAGES_OAUTH_ALLOWED_COMPANY_IDS;
    process.env.META_MESSENGER_OAUTH_ENABLED = "true";
    process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS = "";
    process.env.META_PAGES_OAUTH_ALLOWED_COMPANY_IDS = "";
    try {
      const readiness = buildMetaMessengerLoginReadiness(DEMO);
      assert.equal(readiness.ready, false);
      assert.equal(readiness.reason, "MSL_COMPANY_NOT_ALLOWED");
      assert.ok(!JSON.stringify(readiness).toLowerCase().includes("secret"));
    } finally {
      process.env.META_MESSENGER_OAUTH_ENABLED = prevEnabled;
      process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS = prevAllow;
      process.env.META_PAGES_OAUTH_ALLOWED_COMPANY_IDS = prevPagesAllow;
    }
  });
});
