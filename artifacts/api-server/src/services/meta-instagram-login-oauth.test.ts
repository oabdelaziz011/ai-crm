import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMetaInstagramLoginReadiness,
  handleMetaInstagramLoginCallback,
  MetaInstagramLoginError,
  startMetaInstagramLogin,
  __metaInstagramLoginTest,
} from "./meta-instagram-login-oauth.js";
import {
  createMetaOauthState,
  resolveMetaOauthStateSecret,
  verifyMetaOauthState,
} from "./meta-oauth-state.js";

const DEMO = "d0000010-0001-4001-8001-000000000002";
const OTHER = "d0000010-0001-4001-8001-000000000099";

describe("meta-instagram-login-oauth", () => {
  it("validates signed OAuth state and rejects company mismatch", () => {
    const secret = "unit-igl-state-secret";
    const now = Date.now();
    const state = createMetaOauthState({
      companyId: DEMO,
      userId: "u1",
      flow: __metaInstagramLoginTest.META_INSTAGRAM_LOGIN_FLOW,
      secret,
      nowMs: now,
    });
    const ok = verifyMetaOauthState(
      state,
      secret,
      __metaInstagramLoginTest.META_INSTAGRAM_LOGIN_FLOW,
      now,
      DEMO,
    );
    assert.equal(ok.companyId, DEMO);
    assert.throws(
      () =>
        verifyMetaOauthState(
          state,
          secret,
          __metaInstagramLoginTest.META_INSTAGRAM_LOGIN_FLOW,
          now,
          OTHER,
        ),
      (err: unknown) =>
        err instanceof Error && (err as { code?: string }).code === "META_OAUTH_STATE_COMPANY_MISMATCH",
    );
  });

  it("denies start when master flag is off", () => {
    const prev = process.env.META_INSTAGRAM_LOGIN_ENABLED;
    const prevPages = process.env.META_PAGES_OAUTH_ENABLED;
    process.env.META_INSTAGRAM_LOGIN_ENABLED = "false";
    process.env.META_PAGES_OAUTH_ENABLED = "false";
    try {
      assert.throws(
        () => startMetaInstagramLogin({ companyId: DEMO, userId: null }),
        (err: unknown) => err instanceof MetaInstagramLoginError && err.code === "IGL_DISABLED",
      );
    } finally {
      process.env.META_INSTAGRAM_LOGIN_ENABLED = prev;
      process.env.META_PAGES_OAUTH_ENABLED = prevPages;
    }
  });

  it("builds authorize URL with Instagram Login scopes only", () => {
    const prevEnabled = process.env.META_INSTAGRAM_LOGIN_ENABLED;
    const prevAllow = process.env.META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS;
    const prevApp = process.env.META_INSTAGRAM_LOGIN_APP_ID;
    const prevSecret = process.env.META_INSTAGRAM_LOGIN_APP_SECRET;
    const prevBase = process.env.META_OAUTH_PUBLIC_API_BASE_URL;
    const prevState = process.env.META_INSTAGRAM_LOGIN_STATE_SECRET;
    process.env.META_INSTAGRAM_LOGIN_ENABLED = "true";
    process.env.META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS = DEMO;
    process.env.META_INSTAGRAM_LOGIN_APP_ID = "ig-app-id";
    process.env.META_INSTAGRAM_LOGIN_APP_SECRET = "ig-app-secret";
    process.env.META_OAUTH_PUBLIC_API_BASE_URL = "http://127.0.0.1:3010";
    process.env.META_INSTAGRAM_LOGIN_STATE_SECRET = "unit-state-secret";
    try {
      const session = startMetaInstagramLogin({ companyId: DEMO, userId: "u1" });
      assert.match(session.authorizeUrl, /^https:\/\/www\.instagram\.com\/oauth\/authorize\?/);
      assert.match(session.authorizeUrl, /instagram_business_basic/);
      assert.match(session.authorizeUrl, /instagram_business_manage_messages/);
      assert.doesNotMatch(session.authorizeUrl, /pages_show_list|instagram_basic/);
      assert.equal(
        session.redirectUri,
        "http://127.0.0.1:3010/api/oauth/instagram/callback",
      );
      assert.ok(!JSON.stringify(session).includes("ig-app-secret"));
    } finally {
      process.env.META_INSTAGRAM_LOGIN_ENABLED = prevEnabled;
      process.env.META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS = prevAllow;
      process.env.META_INSTAGRAM_LOGIN_APP_ID = prevApp;
      process.env.META_INSTAGRAM_LOGIN_APP_SECRET = prevSecret;
      process.env.META_OAUTH_PUBLIC_API_BASE_URL = prevBase;
      process.env.META_INSTAGRAM_LOGIN_STATE_SECRET = prevState;
    }
  });

  it("exchanges code via mocked Meta endpoints and persists by companyId", async () => {
    const prevEnabled = process.env.META_INSTAGRAM_LOGIN_ENABLED;
    const prevAllow = process.env.META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS;
    const prevApp = process.env.META_INSTAGRAM_LOGIN_APP_ID;
    const prevSecret = process.env.META_INSTAGRAM_LOGIN_APP_SECRET;
    const prevBase = process.env.META_OAUTH_PUBLIC_API_BASE_URL;
    const prevState = process.env.META_INSTAGRAM_LOGIN_STATE_SECRET;
    const prevLogin = process.env.LOGIN_APP_URL;
    process.env.META_INSTAGRAM_LOGIN_ENABLED = "true";
    process.env.META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS = DEMO;
    process.env.META_INSTAGRAM_LOGIN_APP_ID = "ig-app-id";
    process.env.META_INSTAGRAM_LOGIN_APP_SECRET = "ig-app-secret";
    process.env.META_OAUTH_PUBLIC_API_BASE_URL = "http://127.0.0.1:3010";
    process.env.META_INSTAGRAM_LOGIN_STATE_SECRET = "unit-state-secret";
    process.env.LOGIN_APP_URL = "http://localhost:5180";

    const secret = resolveMetaOauthStateSecret("unit-state-secret");
    const state = createMetaOauthState({
      companyId: DEMO,
      userId: "u1",
      flow: __metaInstagramLoginTest.META_INSTAGRAM_LOGIN_FLOW,
      secret,
    });

    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return { error: null };
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        update: (row: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(row);
            return { error: null };
          },
        }),
      }),
    };

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("api.instagram.com/oauth/access_token")) {
        assert.equal(init?.method, "POST");
        return new Response(
          JSON.stringify({
            access_token: "short-token",
            user_id: "17841400000000000",
            permissions: "instagram_business_basic,instagram_business_manage_messages",
          }),
          { status: 200 },
        );
      }
      if (url.includes("graph.instagram.com/access_token")) {
        return new Response(
          JSON.stringify({ access_token: "long-token", token_type: "bearer", expires_in: 5184000 }),
          { status: 200 },
        );
      }
      if (url.includes("/me?")) {
        return new Response(
          JSON.stringify({
            user_id: "17841400000000000",
            username: "valueor_demo",
            account_type: "BUSINESS",
          }),
          { status: 200 },
        );
      }
      if (url.includes("/subscribed_apps")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      // Health probe after subscribe: GET /{ig-user-id}?fields=id,username
      if (url.includes("17841400000000000") && url.includes("fields=")) {
        return new Response(
          JSON.stringify({ id: "17841400000000000", username: "valueor_demo" }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), {
        status: 500,
      });
    };

    try {
      const result = await handleMetaInstagramLoginCallback({
        code: "auth-code-1",
        state,
        error: null,
        errorReason: null,
        deps: {
          client: client as never,
          fetchImpl,
        },
      });
      assert.match(result.redirectUrl, /instagram_oauth=connected/);
      assert.match(result.redirectUrl, /username=valueor_demo/);
      assert.equal(rpcCalls.length, 1);
      assert.equal(rpcCalls[0]?.name, "upsert_company_instagram_settings");
      assert.equal(rpcCalls[0]?.args.p_company_id, DEMO);
      assert.equal(rpcCalls[0]?.args.p_access_token, "long-token");
      assert.equal(rpcCalls[0]?.args.p_instagram_business_account_id, "17841400000000000");
      assert.ok(!result.redirectUrl.includes("long-token"));
      assert.ok(!result.redirectUrl.includes("short-token"));
      assert.ok(updates.some((u) => u.oauth_mode === "instagram_login"));
      assert.ok(updates.some((u) => u.connection_status === "connected"));
    } finally {
      process.env.META_INSTAGRAM_LOGIN_ENABLED = prevEnabled;
      process.env.META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS = prevAllow;
      process.env.META_INSTAGRAM_LOGIN_APP_ID = prevApp;
      process.env.META_INSTAGRAM_LOGIN_APP_SECRET = prevSecret;
      process.env.META_OAUTH_PUBLIC_API_BASE_URL = prevBase;
      process.env.META_INSTAGRAM_LOGIN_STATE_SECRET = prevState;
      process.env.LOGIN_APP_URL = prevLogin;
    }
  });

  it("rejects personal Instagram accounts", () => {
    assert.throws(
      () =>
        __metaInstagramLoginTest.assertProfessionalAccount({
          id: "1",
          username: "personal_user",
          accountType: "PERSONAL",
        }),
      (err: unknown) =>
        err instanceof MetaInstagramLoginError && err.code === "IGL_PERSONAL_ACCOUNT_UNSUPPORTED",
    );
  });

  it("persists webhook_subscription_failed when subscribed_apps fails", async () => {
    const prevEnabled = process.env.META_INSTAGRAM_LOGIN_ENABLED;
    const prevAllow = process.env.META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS;
    const prevApp = process.env.META_INSTAGRAM_LOGIN_APP_ID;
    const prevSecret = process.env.META_INSTAGRAM_LOGIN_APP_SECRET;
    const prevBase = process.env.META_OAUTH_PUBLIC_API_BASE_URL;
    const prevState = process.env.META_INSTAGRAM_LOGIN_STATE_SECRET;
    const prevLogin = process.env.LOGIN_APP_URL;
    process.env.META_INSTAGRAM_LOGIN_ENABLED = "true";
    process.env.META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS = DEMO;
    process.env.META_INSTAGRAM_LOGIN_APP_ID = "ig-app-id";
    process.env.META_INSTAGRAM_LOGIN_APP_SECRET = "ig-app-secret";
    process.env.META_OAUTH_PUBLIC_API_BASE_URL = "http://127.0.0.1:3010";
    process.env.META_INSTAGRAM_LOGIN_STATE_SECRET = "unit-state-secret";
    process.env.LOGIN_APP_URL = "http://localhost:5180";

    const secret = resolveMetaOauthStateSecret("unit-state-secret");
    const state = createMetaOauthState({
      companyId: DEMO,
      userId: "u1",
      flow: __metaInstagramLoginTest.META_INSTAGRAM_LOGIN_FLOW,
      secret,
    });

    const updates: Array<Record<string, unknown>> = [];
    const client = {
      rpc: async () => ({ error: null }),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        update: (row: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(row);
            return { error: null };
          },
        }),
      }),
    };

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.instagram.com/oauth/access_token")) {
        return new Response(
          JSON.stringify({
            access_token: "short-token",
            user_id: "17841400000000000",
            permissions: "instagram_business_basic,instagram_business_manage_messages",
          }),
          { status: 200 },
        );
      }
      if (url.includes("graph.instagram.com/access_token")) {
        return new Response(
          JSON.stringify({ access_token: "long-token", expires_in: 5184000 }),
          { status: 200 },
        );
      }
      if (url.includes("/me?")) {
        return new Response(
          JSON.stringify({
            user_id: "17841400000000000",
            username: "valueor_demo",
            account_type: "BUSINESS",
          }),
          { status: 200 },
        );
      }
      if (url.includes("/subscribed_apps")) {
        return new Response(JSON.stringify({ success: false, error: { message: "subscribe denied" } }), {
          status: 400,
        });
      }
      return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), {
        status: 500,
      });
    };

    try {
      const result = await handleMetaInstagramLoginCallback({
        code: "auth-code-1",
        state,
        error: null,
        errorReason: null,
        deps: { client: client as never, fetchImpl },
      });
      assert.match(result.redirectUrl, /instagram_oauth=webhook_failed/);
      assert.ok(updates.some((u) => u.connection_status === "webhook_subscription_failed"));
    } finally {
      process.env.META_INSTAGRAM_LOGIN_ENABLED = prevEnabled;
      process.env.META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS = prevAllow;
      process.env.META_INSTAGRAM_LOGIN_APP_ID = prevApp;
      process.env.META_INSTAGRAM_LOGIN_APP_SECRET = prevSecret;
      process.env.META_OAUTH_PUBLIC_API_BASE_URL = prevBase;
      process.env.META_INSTAGRAM_LOGIN_STATE_SECRET = prevState;
      process.env.LOGIN_APP_URL = prevLogin;
    }
  });

  it("reports readiness without secrets", () => {
    const prevEnabled = process.env.META_INSTAGRAM_LOGIN_ENABLED;
    const prevAllow = process.env.META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS;
    process.env.META_INSTAGRAM_LOGIN_ENABLED = "true";
    process.env.META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS = "";
    process.env.META_PAGES_OAUTH_ALLOWED_COMPANY_IDS = "";
    try {
      const readiness = buildMetaInstagramLoginReadiness(DEMO);
      assert.equal(readiness.ready, false);
      assert.equal(readiness.reason, "IGL_COMPANY_NOT_ALLOWED");
      assert.ok(!JSON.stringify(readiness).toLowerCase().includes("secret"));
    } finally {
      process.env.META_INSTAGRAM_LOGIN_ENABLED = prevEnabled;
      process.env.META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS = prevAllow;
    }
  });

  it("strips Instagram #_ suffix from auth codes", () => {
    assert.equal(__metaInstagramLoginTest.stripAuthCode("abc#_"), "abc");
  });
});
