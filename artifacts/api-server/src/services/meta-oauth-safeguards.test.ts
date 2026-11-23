/**
 * Meta OAuth safeguards: blocked overwrite, safe disconnect, durable pending, isolation.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  assertCanClearMetaCredentials,
  assertCanReplaceExistingMetaConnection,
  hasExistingMetaConnection,
} from "./meta-oauth-connection-guard.js";
import {
  clearMetaOauthPendingSession,
  putMetaOauthPendingSession,
  takeMetaOauthPendingSession,
  __clearMetaOauthPendingMemoryForTests,
} from "./meta-oauth-pending-store.js";
import {
  completeMetaMessengerLogin,
  handleMetaMessengerLoginCallback,
  MetaMessengerLoginError,
  softDisconnectMetaMessengerLogin,
  __metaMessengerLoginTest,
} from "./meta-messenger-login-oauth.js";
import { createMetaOauthState, resolveMetaOauthStateSecret } from "./meta-oauth-state.js";

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
  process.env.META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS = `${DEMO},${OTHER}`;
  process.env.META_MESSENGER_OAUTH_APP_ID = "fb-app-id";
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

function mockClient(options?: {
  existing?: Record<string, unknown> | null;
  onUpdate?: (patch: Record<string, unknown>) => void;
}) {
  const existing = options?.existing ?? null;
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "get_company_messenger_settings_decrypted") {
        return { data: { access_token: "page-token" }, error: null };
      }
      return { name, args, error: null };
    },
    from: () => ({
      upsert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          options?.onUpdate?.(patch);
          return { error: null };
        },
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: existing, error: null }),
        }),
      }),
    }),
  };
}

const pageFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("/oauth/access_token")) {
    return new Response(
      JSON.stringify({ access_token: "user-token", expires_in: 5184000 }),
      { status: 200 },
    );
  }
  if (url.includes("/me/accounts")) {
    return new Response(
      JSON.stringify({
        data: [{ id: "page-1", name: "Demo Page", access_token: "page-token-1" }],
      }),
      { status: 200 },
    );
  }
  if (url.includes("/subscribed_apps") && init?.method === "POST") {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }
  if (url.includes("/subscribed_apps")) {
    return new Response(
      JSON.stringify({ data: [{ subscribed_fields: ["messages"] }] }),
      { status: 200 },
    );
  }
  if (url.includes("page-1")) {
    return new Response(JSON.stringify({ id: "page-1", name: "Demo Page" }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: { message: url } }), { status: 500 });
};

beforeEach(() => {
  __clearMetaOauthPendingMemoryForTests();
});

describe("meta-oauth-connection-guard", () => {
  it("detects existing credentials", () => {
    assert.equal(hasExistingMetaConnection(null), false);
    assert.equal(
      hasExistingMetaConnection({
        hasAccessToken: true,
        pageOrAccountId: null,
        enabled: true,
        credentialSource: "manual",
      }),
      true,
    );
  });

  it("blocks silent replace for Messenger and Instagram", () => {
    assert.throws(
      () =>
        assertCanReplaceExistingMetaConnection({
          existing: {
            hasAccessToken: true,
            pageOrAccountId: "page-1",
            enabled: true,
            credentialSource: "manual",
          },
          confirmReplaceExisting: false,
          channel: "messenger",
        }),
      (err: unknown) =>
        err instanceof Error &&
        (err as { code?: string }).code === "MSL_BLOCKED_EXISTING_CONNECTION",
    );
    assert.throws(
      () =>
        assertCanReplaceExistingMetaConnection({
          existing: {
            hasAccessToken: true,
            pageOrAccountId: "ig-1",
            enabled: true,
            credentialSource: "manual",
          },
          confirmReplaceExisting: false,
          channel: "instagram",
        }),
      (err: unknown) =>
        err instanceof Error &&
        (err as { code?: string }).code === "IGL_BLOCKED_EXISTING_CONNECTION",
    );
  });

  it("allows replace after explicit confirmation", () => {
    assert.doesNotThrow(() =>
      assertCanReplaceExistingMetaConnection({
        existing: {
          hasAccessToken: true,
          pageOrAccountId: "page-1",
          enabled: true,
          credentialSource: "manual",
        },
        confirmReplaceExisting: true,
        channel: "messenger",
      }),
    );
  });

  it("soft-disables manual credentials without clearing unless confirmed", () => {
    const soft = assertCanClearMetaCredentials({
      existing: {
        hasAccessToken: true,
        pageOrAccountId: "page-1",
        enabled: true,
        credentialSource: "manual",
      },
      confirmClearCredentials: false,
      channel: "messenger",
    });
    assert.equal(soft.clearSecrets, false);
    assert.equal(soft.softDisableOnly, true);

    const cleared = assertCanClearMetaCredentials({
      existing: {
        hasAccessToken: true,
        pageOrAccountId: "page-1",
        enabled: true,
        credentialSource: "manual",
      },
      confirmClearCredentials: true,
      channel: "messenger",
    });
    assert.equal(cleared.clearSecrets, true);
  });

  it("requires confirmation before clearing OAuth credentials", () => {
    assert.throws(
      () =>
        assertCanClearMetaCredentials({
          existing: {
            hasAccessToken: true,
            pageOrAccountId: "page-1",
            enabled: true,
            credentialSource: "oauth",
          },
          confirmClearCredentials: false,
          channel: "messenger",
        }),
      (err: unknown) =>
        err instanceof Error &&
        (err as { code?: string }).code === "MSL_DISCONNECT_CONFIRMATION_REQUIRED",
    );
  });
});

describe("meta-oauth-pending-store durability + isolation", () => {
  it("stores company-scoped pending payload and rejects cross-company take", async () => {
    const state = "state-abc";
    await putMetaOauthPendingSession({
      state,
      companyId: DEMO,
      flow: "messenger_facebook_login",
      payload: { pages: [{ pageId: "p1", name: "N", pageAccessToken: "tok" }] },
      nowMs: Date.now(),
    });
    const hit = await takeMetaOauthPendingSession({
      state,
      companyId: DEMO,
      flow: "messenger_facebook_login",
      nowMs: Date.now(),
      consume: false,
    });
    assert.ok(hit);
    await assert.rejects(
      () =>
        takeMetaOauthPendingSession({
          state,
          companyId: OTHER,
          flow: "messenger_facebook_login",
          nowMs: Date.now(),
        }),
      (err: unknown) =>
        err instanceof Error &&
        (err as { code?: string }).code === "META_OAUTH_PENDING_COMPANY_MISMATCH",
    );
    await clearMetaOauthPendingSession({ state });
  });

  it("expires pending sessions", async () => {
    const state = "state-expired";
    const now = Date.now();
    await putMetaOauthPendingSession({
      state,
      companyId: DEMO,
      flow: "messenger_facebook_login",
      payload: { pages: [] },
      nowMs: now - 60_000,
      ttlMs: 1_000,
    });
    const hit = await takeMetaOauthPendingSession({
      state,
      companyId: DEMO,
      flow: "messenger_facebook_login",
      nowMs: now,
    });
    assert.equal(hit, null);
  });
});

describe("messenger OAuth complete safeguards", () => {
  it("blocks overwriting an existing manual connection without confirmReplaceExisting", async () => {
    await withMessengerEnv(async () => {
      const secret = resolveMetaOauthStateSecret("unit-msl-state");
      const state = createMetaOauthState({
        companyId: DEMO,
        userId: null,
        flow: __metaMessengerLoginTest.META_MESSENGER_LOGIN_FLOW,
        secret,
      });
      const client = mockClient({
        existing: {
          enabled: true,
          page_id: "page-old",
          access_token_encrypted: "enc-manual",
          credential_source: "manual",
        },
      });
      try {
        await handleMetaMessengerLoginCallback({
          code: "code",
          state,
          error: null,
          errorReason: null,
          deps: { client: client as never, fetchImpl: pageFetch },
        });
        await assert.rejects(
          () =>
            completeMetaMessengerLogin({
              companyId: DEMO,
              state,
              pageId: "page-1",
              confirmReplaceExisting: false,
              deps: { client: client as never, fetchImpl: pageFetch },
            }),
          (err: unknown) =>
            err instanceof MetaMessengerLoginError &&
            err.code === "MSL_BLOCKED_EXISTING_CONNECTION",
        );
      } finally {
        await __metaMessengerLoginTest.clearPending({ state });
        __metaMessengerLoginTest.clearMemory();
      }
    });
  });

  it("allows explicit reconnect and marks credential_source oauth", async () => {
    await withMessengerEnv(async () => {
      const secret = resolveMetaOauthStateSecret("unit-msl-state");
      const state = createMetaOauthState({
        companyId: DEMO,
        userId: null,
        flow: __metaMessengerLoginTest.META_MESSENGER_LOGIN_FLOW,
        secret,
        confirmReplaceExisting: true,
      });
      const patches: Record<string, unknown>[] = [];
      const client = mockClient({
        existing: {
          enabled: true,
          page_id: "page-old",
          access_token_encrypted: "enc-manual",
          credential_source: "manual",
          webhook_verify_token_encrypted: "enc-v",
        },
        onUpdate: (p) => patches.push(p),
      });
      try {
        await handleMetaMessengerLoginCallback({
          code: "code",
          state,
          error: null,
          errorReason: null,
          deps: { client: client as never, fetchImpl: pageFetch },
        });
        const done = await completeMetaMessengerLogin({
          companyId: DEMO,
          state,
          pageId: "page-1",
          confirmReplaceExisting: true,
          deps: { client: client as never, fetchImpl: pageFetch },
        });
        assert.equal(done.connected, true);
        assert.ok(patches.some((p) => p.credential_source === "oauth"));
        assert.ok(patches.some((p) => p.connection_status === "connected"));
      } finally {
        await __metaMessengerLoginTest.clearPending({ state });
        __metaMessengerLoginTest.clearMemory();
      }
    });
  });

  it("new company OAuth connection succeeds without confirm", async () => {
    await withMessengerEnv(async () => {
      const secret = resolveMetaOauthStateSecret("unit-msl-state");
      const state = createMetaOauthState({
        companyId: DEMO,
        userId: null,
        flow: __metaMessengerLoginTest.META_MESSENGER_LOGIN_FLOW,
        secret,
      });
      const client = mockClient({ existing: null });
      try {
        await handleMetaMessengerLoginCallback({
          code: "code",
          state,
          error: null,
          errorReason: null,
          deps: { client: client as never, fetchImpl: pageFetch },
        });
        const done = await completeMetaMessengerLogin({
          companyId: DEMO,
          state,
          pageId: "page-1",
          deps: { client: client as never, fetchImpl: pageFetch },
        });
        assert.equal(done.ok, true);
        assert.equal(done.connected, true);
      } finally {
        await __metaMessengerLoginTest.clearPending({ state });
        __metaMessengerLoginTest.clearMemory();
      }
    });
  });

  it("reports webhook subscription failure clearly", async () => {
    await withMessengerEnv(async () => {
      const secret = resolveMetaOauthStateSecret("unit-msl-state");
      const state = createMetaOauthState({
        companyId: DEMO,
        userId: null,
        flow: __metaMessengerLoginTest.META_MESSENGER_LOGIN_FLOW,
        secret,
      });
      const failingFetch: typeof fetch = async (input, init) => {
        const url = String(input);
        if (url.includes("/oauth/access_token")) {
          return new Response(JSON.stringify({ access_token: "user-token" }), { status: 200 });
        }
        if (url.includes("/me/accounts")) {
          return new Response(
            JSON.stringify({
              data: [{ id: "page-1", name: "Demo Page", access_token: "page-token-1" }],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/subscribed_apps") && init?.method === "POST") {
          return new Response(JSON.stringify({ error: { message: "subscribe denied" } }), {
            status: 400,
          });
        }
        if (url.includes("page-1")) {
          return new Response(JSON.stringify({ id: "page-1", name: "Demo Page" }), { status: 200 });
        }
        return new Response("{}", { status: 500 });
      };
      const patches: Record<string, unknown>[] = [];
      const client = mockClient({
        existing: null,
        onUpdate: (p) => patches.push(p),
      });
      try {
        await handleMetaMessengerLoginCallback({
          code: "code",
          state,
          error: null,
          errorReason: null,
          deps: { client: client as never, fetchImpl: failingFetch },
        });
        const done = await completeMetaMessengerLogin({
          companyId: DEMO,
          state,
          pageId: "page-1",
          deps: { client: client as never, fetchImpl: failingFetch },
        });
        assert.equal(done.connected, false);
        assert.equal(done.connectionStatus, "webhook_subscription_failed");
        assert.match(done.message, /webhook subscription failed/i);
        assert.ok(patches.some((p) => p.webhook_subscription_status === "failed"));
      } finally {
        await __metaMessengerLoginTest.clearPending({ state });
        __metaMessengerLoginTest.clearMemory();
      }
    });
  });

  it("manual disconnect preserves credentials without confirmClearCredentials", async () => {
    await withMessengerEnv(async () => {
      const patches: Record<string, unknown>[] = [];
      const client = mockClient({
        existing: {
          enabled: true,
          page_id: "page-1",
          access_token_encrypted: "enc",
          credential_source: "manual",
          api_version: "v21.0",
        },
        onUpdate: (p) => patches.push(p),
      });
      const result = await softDisconnectMetaMessengerLogin({
        companyId: DEMO,
        confirmClearCredentials: false,
        deps: { client: client as never },
      });
      assert.equal(result.softDisableOnly, true);
      assert.equal(result.clearedCredentials, false);
      assert.equal(patches[0]?.enabled, false);
      assert.equal(patches[0]?.access_token_encrypted, undefined);
    });
  });
});
