import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  isWhatsAppEmbeddedSignupAllowProductionSubscribe,
  isWhatsAppEmbeddedSignupAutoSubscribeEnabled,
  isWhatsAppEmbeddedSignupProductionRuntime,
} from "./whatsapp-embedded-signup-flags.js";
import {
  extractSubscribedAppIds,
  isTargetAppSubscribed,
  maybeSubscribeWabaToWebhook,
} from "./whatsapp-embedded-signup-waba-subscribe.js";

const ENV_KEYS = [
  "NODE_ENV",
  "WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE",
  "WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE",
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

afterEach(() => {
  restoreEnv();
});

function graphJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function subscribedList(appIds: string[]) {
  return {
    data: appIds.map((id) => ({
      whatsapp_business_api_data: {
        id,
        name: `App ${id}`,
        link: `https://www.facebook.com/games/?app_id=${id}`,
      },
    })),
  };
}

const BASE_INPUT = {
  wabaId: "waba-test-001",
  accessToken: "EAAB-customer-scoped-test-token",
  callbackUrl: "https://example.test/api/webhooks/whatsapp",
  graphApiVersion: "v21.0",
  targetAppId: "es-app-111",
};

describe("whatsapp-embedded-signup-waba-subscribe helpers", () => {
  it("extracts app ids from nested whatsapp_business_api_data", () => {
    assert.deepEqual(extractSubscribedAppIds(subscribedList(["a", "b"])), ["a", "b"]);
    assert.equal(isTargetAppSubscribed(subscribedList(["es-app-111"]), "es-app-111"), true);
    assert.equal(isTargetAppSubscribed(subscribedList(["other"]), "es-app-111"), false);
  });
});

describe("whatsapp-embedded-signup-waba-subscribe", () => {
  it("flag off → skipped_flag_off with zero Graph calls", async () => {
    snapshotEnv();
    delete process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE;
    process.env.NODE_ENV = "development";

    let calls = 0;
    const result = await maybeSubscribeWabaToWebhook(BASE_INPUT, {
      fetchImpl: async () => {
        calls += 1;
        return graphJson(200, {});
      },
    });

    assert.equal(calls, 0);
    assert.equal(result.status, "skipped_flag_off");
    assert.equal(result.attempted, false);
    assert.equal(result.ok, false);
    assert.equal(result.persistenceHint.webhook_subscription_status, "skipped_flag_off");
    assert.equal(result.persistenceHint.webhook_override_used, false);
  });

  it("production guard blocks Graph even when AUTO_SUBSCRIBE=true", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE = "false";
    process.env.NODE_ENV = "production";

    assert.equal(isWhatsAppEmbeddedSignupAutoSubscribeEnabled(), true);
    assert.equal(isWhatsAppEmbeddedSignupProductionRuntime(), true);
    assert.equal(isWhatsAppEmbeddedSignupAllowProductionSubscribe(), false);

    let calls = 0;
    const result = await maybeSubscribeWabaToWebhook(BASE_INPUT, {
      fetchImpl: async () => {
        calls += 1;
        return graphJson(200, {});
      },
    });

    assert.equal(calls, 0);
    assert.equal(result.status, "blocked_production");
    assert.equal(result.attempted, false);
    assert.equal(result.ok, false);
    assert.match(String(result.error), /blocked in production/i);
  });

  it("already subscribed → GET only, no POST", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.NODE_ENV = "test";
    delete process.env.WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE;

    const methods: string[] = [];
    const result = await maybeSubscribeWabaToWebhook(BASE_INPUT, {
      fetchImpl: async (_url, init) => {
        methods.push(String(init?.method ?? "GET"));
        return graphJson(200, subscribedList(["es-app-111", "other"]));
      },
      sleep: async () => undefined,
    });

    assert.deepEqual(methods, ["GET"]);
    assert.equal(result.status, "already_subscribed");
    assert.equal(result.ok, true);
    assert.equal(result.attempted, true);
    assert.equal(result.persistenceHint.webhook_subscription_app_id, "es-app-111");
    assert.ok(result.persistenceHint.webhook_subscribed_at);
  });

  it("successful subscribe → GET, POST, GET verify", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.NODE_ENV = "development";

    const methods: string[] = [];
    const bodies: Array<string | undefined> = [];
    let getCount = 0;

    const result = await maybeSubscribeWabaToWebhook(BASE_INPUT, {
      fetchImpl: async (_url, init) => {
        const method = String(init?.method ?? "GET");
        methods.push(method);
        bodies.push(typeof init?.body === "string" ? init.body : undefined);
        if (method === "GET") {
          getCount += 1;
          if (getCount === 1) return graphJson(200, subscribedList([]));
          return graphJson(200, subscribedList(["es-app-111"]));
        }
        return graphJson(200, { success: true });
      },
      sleep: async () => undefined,
    });

    assert.deepEqual(methods, ["GET", "POST", "GET"]);
    assert.equal(bodies[1], "{}");
    assert.equal(result.status, "subscribed");
    assert.equal(result.ok, true);
    assert.equal(result.attempted, true);
  });

  it("POST success but GET verification missing app → failed", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.NODE_ENV = "development";

    let getCount = 0;
    const result = await maybeSubscribeWabaToWebhook(BASE_INPUT, {
      fetchImpl: async (_url, init) => {
        const method = String(init?.method ?? "GET");
        if (method === "GET") {
          getCount += 1;
          // Always empty — POST "succeeds" but verification fails.
          return graphJson(200, subscribedList([]));
        }
        return graphJson(200, { success: true });
      },
      sleep: async () => undefined,
    });

    assert.equal(result.status, "failed");
    assert.equal(result.ok, false);
    assert.match(String(result.error), /not present on subsequent GET/i);
  });

  it("invalid token (401) → failed, no retry", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.NODE_ENV = "development";

    let calls = 0;
    const result = await maybeSubscribeWabaToWebhook(BASE_INPUT, {
      fetchImpl: async () => {
        calls += 1;
        return graphJson(401, {
          error: { message: "Invalid OAuth access token", code: 190 },
        });
      },
      sleep: async () => undefined,
      maxAttempts: 3,
    });

    assert.equal(calls, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.graphHttpStatus, 401);
    assert.equal(result.ok, false);
  });

  it("insufficient permissions (403 / Graph 200) → failed, no retry", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.NODE_ENV = "development";

    let calls = 0;
    const result = await maybeSubscribeWabaToWebhook(BASE_INPUT, {
      fetchImpl: async () => {
        calls += 1;
        return graphJson(403, {
          error: { message: "Permissions error", type: "OAuthException", code: 200 },
        });
      },
      sleep: async () => undefined,
      maxAttempts: 3,
    });

    assert.equal(calls, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.graphErrorCode, 200);
  });

  it("WABA not found (404) → failed", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.NODE_ENV = "development";

    const result = await maybeSubscribeWabaToWebhook(BASE_INPUT, {
      fetchImpl: async () =>
        graphJson(404, { error: { message: "Unsupported get request", code: 100 } }),
      sleep: async () => undefined,
    });

    assert.equal(result.status, "failed");
    assert.equal(result.graphHttpStatus, 404);
  });

  it("rate limit 80008 → pending_retry after bounded attempts", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.NODE_ENV = "development";

    let calls = 0;
    const sleeps: number[] = [];
    const result = await maybeSubscribeWabaToWebhook(BASE_INPUT, {
      fetchImpl: async () => {
        calls += 1;
        return graphJson(400, {
          error: {
            message: "Too many calls",
            code: 80008,
            is_transient: true,
          },
        });
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      maxAttempts: 3,
      baseDelayMs: 10,
    });

    assert.equal(calls, 3);
    assert.equal(sleeps.length, 2);
    assert.equal(result.status, "pending_retry");
    assert.equal(result.graphErrorCode, 80008);
    assert.equal(result.ok, false);
  });

  it("transient 5xx → retries then pending_retry", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.NODE_ENV = "development";

    let calls = 0;
    const result = await maybeSubscribeWabaToWebhook(BASE_INPUT, {
      fetchImpl: async () => {
        calls += 1;
        return graphJson(503, {
          error: { message: "Service unavailable", is_transient: true },
        });
      },
      sleep: async () => undefined,
      maxAttempts: 2,
    });

    assert.equal(calls, 2);
    assert.equal(result.status, "pending_retry");
    assert.equal(result.graphIsTransient, true);
  });

  it("bounded retry recovers after transient then succeeds", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.NODE_ENV = "development";

    let call = 0;
    const result = await maybeSubscribeWabaToWebhook(BASE_INPUT, {
      fetchImpl: async (_url, init) => {
        call += 1;
        const method = String(init?.method ?? "GET");
        // Attempt 1 GET fails transient
        if (call === 1) {
          return graphJson(503, { error: { message: "tmp", is_transient: true } });
        }
        // Attempt 2: GET empty → POST → GET verify
        if (method === "POST") return graphJson(200, { success: true });
        if (call === 2) return graphJson(200, subscribedList([]));
        return graphJson(200, subscribedList(["es-app-111"]));
      },
      sleep: async () => undefined,
      maxAttempts: 3,
    });

    assert.equal(result.status, "subscribed");
    assert.equal(result.ok, true);
    assert.ok(result.attempts >= 2);
  });

  it("does not log tokens or put token in URL", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.NODE_ENV = "development";

    const urls: string[] = [];
    const authHeaders: string[] = [];
    const consoleSpy: unknown[] = [];
    const originalWarn = console.warn;
    const originalLog = console.log;
    console.warn = (...args: unknown[]) => {
      consoleSpy.push(args);
    };
    console.log = (...args: unknown[]) => {
      consoleSpy.push(args);
    };

    try {
      await maybeSubscribeWabaToWebhook(BASE_INPUT, {
        fetchImpl: async (url, init) => {
          urls.push(String(url));
          const headers = init?.headers as Record<string, string>;
          authHeaders.push(String(headers?.Authorization ?? ""));
          return graphJson(200, subscribedList(["es-app-111"]));
        },
        sleep: async () => undefined,
      });
    } finally {
      console.warn = originalWarn;
      console.log = originalLog;
    }

    for (const url of urls) {
      assert.equal(url.includes("EAAB-customer-scoped-test-token"), false);
      assert.equal(url.includes("access_token"), false);
    }
    assert.ok(authHeaders.every((h) => h.startsWith("Bearer ")));
    const dumped = JSON.stringify(consoleSpy);
    assert.equal(dumped.includes("EAAB-customer-scoped-test-token"), false);
  });

  it("never sends override_callback_uri or verify_token (basic subscribe only)", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.NODE_ENV = "development";

    const postBodies: string[] = [];
    let getCount = 0;
    await maybeSubscribeWabaToWebhook(BASE_INPUT, {
      fetchImpl: async (_url, init) => {
        const method = String(init?.method ?? "GET");
        if (method === "POST") {
          postBodies.push(String(init?.body ?? ""));
          return graphJson(200, { success: true });
        }
        getCount += 1;
        if (getCount === 1) return graphJson(200, subscribedList([]));
        return graphJson(200, subscribedList(["es-app-111"]));
      },
      sleep: async () => undefined,
    });

    assert.equal(postBodies.length, 1);
    assert.equal(postBodies[0], "{}");
    assert.equal(postBodies[0]?.includes("override_callback_uri"), false);
    assert.equal(postBodies[0]?.includes("verify_token"), false);
  });

  it("no production Graph calls when NODE_ENV=production without allow flag", async () => {
    snapshotEnv();
    process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE = "true";
    process.env.NODE_ENV = "production";
    delete process.env.WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE;

    let calls = 0;
    const result = await maybeSubscribeWabaToWebhook(
      {
        ...BASE_INPUT,
        // Deliberately fake-looking ids — still must not call Graph.
        wabaId: "prod-waba-should-never-call",
        accessToken: "prod-token-should-never-call",
      },
      {
        fetchImpl: async () => {
          calls += 1;
          return graphJson(200, {});
        },
      },
    );

    assert.equal(calls, 0);
    assert.equal(result.status, "blocked_production");
  });

  it("defaults AUTO_SUBSCRIBE and ALLOW_PRODUCTION_SUBSCRIBE to false", () => {
    snapshotEnv();
    delete process.env.WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE;
    delete process.env.WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE;
    assert.equal(isWhatsAppEmbeddedSignupAutoSubscribeEnabled(), false);
    assert.equal(isWhatsAppEmbeddedSignupAllowProductionSubscribe(), false);
  });
});
