import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMetaMessengerLoginReadiness,
  completeMetaMessengerLogin,
  handleMetaMessengerLoginCallback,
  listPendingMessengerPages,
  MetaMessengerLoginError,
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

  it("builds Facebook dialog authorize URL with required pages scopes", () => {
    const prevEnabled = process.env.META_MESSENGER_OAUTH_ENABLED;
    const prevAllow = process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS;
    const prevApp = process.env.META_MESSENGER_OAUTH_APP_ID;
    const prevSecret = process.env.META_MESSENGER_OAUTH_APP_SECRET;
    const prevBase = process.env.META_OAUTH_PUBLIC_API_BASE_URL;
    const prevState = process.env.META_MESSENGER_OAUTH_STATE_SECRET;
    process.env.META_MESSENGER_OAUTH_ENABLED = "true";
    process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS = DEMO;
    process.env.META_MESSENGER_OAUTH_APP_ID = "fb-app-id";
    process.env.META_MESSENGER_OAUTH_APP_SECRET = "fb-app-secret";
    process.env.META_OAUTH_PUBLIC_API_BASE_URL = "http://127.0.0.1:3010";
    process.env.META_MESSENGER_OAUTH_STATE_SECRET = "unit-msl-state";
    try {
      const session = startMetaMessengerLogin({ companyId: DEMO, userId: null });
      assert.match(session.authorizeUrl, /facebook\.com\/v21\.0\/dialog\/oauth/);
      assert.match(session.authorizeUrl, /pages_show_list/);
      assert.match(session.authorizeUrl, /pages_messaging/);
      assert.match(session.authorizeUrl, /pages_manage_metadata/);
      assert.match(session.authorizeUrl, /pages_read_engagement/);
      assert.equal(session.redirectUri, "http://127.0.0.1:3010/api/oauth/messenger/callback");
      assert.ok(!JSON.stringify(session).includes("fb-app-secret"));
    } finally {
      process.env.META_MESSENGER_OAUTH_ENABLED = prevEnabled;
      process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS = prevAllow;
      process.env.META_MESSENGER_OAUTH_APP_ID = prevApp;
      process.env.META_MESSENGER_OAUTH_APP_SECRET = prevSecret;
      process.env.META_OAUTH_PUBLIC_API_BASE_URL = prevBase;
      process.env.META_MESSENGER_OAUTH_STATE_SECRET = prevState;
    }
  });

  it("callback caches pages and complete persists page token for company", async () => {
    const prevEnabled = process.env.META_MESSENGER_OAUTH_ENABLED;
    const prevAllow = process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS;
    const prevApp = process.env.META_MESSENGER_OAUTH_APP_ID;
    const prevSecret = process.env.META_MESSENGER_OAUTH_APP_SECRET;
    const prevBase = process.env.META_OAUTH_PUBLIC_API_BASE_URL;
    const prevState = process.env.META_MESSENGER_OAUTH_STATE_SECRET;
    const prevLogin = process.env.LOGIN_APP_URL;
    process.env.META_MESSENGER_OAUTH_ENABLED = "true";
    process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS = DEMO;
    process.env.META_MESSENGER_OAUTH_APP_ID = "fb-app-id";
    process.env.META_MESSENGER_OAUTH_APP_SECRET = "fb-app-secret";
    process.env.META_OAUTH_PUBLIC_API_BASE_URL = "http://127.0.0.1:3010";
    process.env.META_MESSENGER_OAUTH_STATE_SECRET = "unit-msl-state";
    process.env.LOGIN_APP_URL = "http://localhost:5180";

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
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    };

    const fetchImpl: typeof fetch = async (input) => {
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
      if (url.includes("/subscribed_apps")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes("page-1")) {
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

      const pending = listPendingMessengerPages({ companyId: DEMO, state });
      assert.equal(pending.pages.length, 2);
      assert.ok(!JSON.stringify(pending).includes("page-token"));

      assert.throws(
        () => listPendingMessengerPages({ companyId: OTHER, state }),
        (err: unknown) =>
          err instanceof MetaMessengerLoginError &&
          (err.code === "MSL_PENDING_COMPANY_MISMATCH" ||
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
      assert.equal(typeof done.webhookVerifyToken, "string");
      assert.match(String(done.webhookVerifyToken), /^vo_ms_/);
      assert.equal(rpcCalls[0]?.name, "upsert_company_messenger_settings");
      assert.equal(rpcCalls[0]?.args.p_company_id, DEMO);
      assert.equal(rpcCalls[0]?.args.p_access_token, "page-token-1");
      assert.equal(rpcCalls[0]?.args.p_page_id, "page-1");
      assert.equal(rpcCalls[0]?.args.p_webhook_verify_token, done.webhookVerifyToken);
    } finally {
      __metaMessengerLoginTest.clearPending(state);
      process.env.META_MESSENGER_OAUTH_ENABLED = prevEnabled;
      process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS = prevAllow;
      process.env.META_MESSENGER_OAUTH_APP_ID = prevApp;
      process.env.META_MESSENGER_OAUTH_APP_SECRET = prevSecret;
      process.env.META_OAUTH_PUBLIC_API_BASE_URL = prevBase;
      process.env.META_MESSENGER_OAUTH_STATE_SECRET = prevState;
      process.env.LOGIN_APP_URL = prevLogin;
    }
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
