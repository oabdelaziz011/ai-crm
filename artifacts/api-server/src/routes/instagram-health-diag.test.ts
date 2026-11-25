import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { HttpError } from "../middleware/error-handler.js";
import {
  buildInstagramHealthDiagFields,
  INSTAGRAM_HEALTH_HARD_DEADLINE_MS,
  INSTAGRAM_HEALTH_PRE_META_STAGE_TIMEOUT_MS,
  isInstagramOutboundHealthPath,
  logInstagramHealthStage,
  sanitizeInstagramHealthDiagFields,
  shouldInstrumentInstagramHealthDiag,
  timeInstagramHealthStage,
  wrapInstagramHealthHardDeadline,
  wrapInstagramHealthMiddleware,
  type InstagramHealthDiagLogFields,
} from "./instagram-health-diag.js";

type FakeRes = Response &
  EventEmitter & {
    headersSent: boolean;
    writableEnded: boolean;
    statusCode: number;
    body?: unknown;
    headers: Record<string, string>;
  };

function createFakeRes(): FakeRes {
  const res = new EventEmitter() as FakeRes;
  res.headersSent = false;
  res.writableEnded = false;
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = ((name: string, value: string | number | readonly string[]) => {
    res.headers[String(name).toLowerCase()] = Array.isArray(value) ? value.join(",") : String(value);
    return res;
  }) as Response["setHeader"];
  res.status = ((code: number) => {
    res.statusCode = code;
    return res;
  }) as Response["status"];
  res.json = ((body: unknown) => {
    res.body = body;
    res.headersSent = true;
    res.writableEnded = true;
    queueMicrotask(() => res.emit("finish"));
    return res;
  }) as Response["json"];
  return res;
}

function createCorsHealthReq(overrides: Partial<Request> = {}): Request {
  return createHealthReq({
    header(name: string) {
      const lower = name.toLowerCase();
      if (lower === "authorization") return "Bearer SECRET_TOKEN_VALUE";
      if (lower === "origin") return "https://valueor.org";
      return undefined;
    },
    ...overrides,
  });
}

function createHealthReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "POST",
    originalUrl: "/api/instagram/channel-outbound-health",
    url: "/api/instagram/channel-outbound-health",
    path: "/instagram/channel-outbound-health",
    requestId: "req-diag-1",
    correlationId: "corr-diag-1",
    header(name: string) {
      if (name.toLowerCase() === "authorization") return "Bearer SECRET_TOKEN_VALUE";
      return undefined;
    },
    ...overrides,
  } as Request;
}

describe("instagram health diag path gate", () => {
  it("detects the outbound health path only", () => {
    assert.equal(
      isInstagramOutboundHealthPath({
        originalUrl: "/api/instagram/channel-outbound-health",
        url: "",
        path: "",
      }),
      true,
    );
    assert.equal(
      isInstagramOutboundHealthPath({
        originalUrl: "/api/instagram/other",
        url: "",
        path: "",
      }),
      false,
    );
  });

  it("skips OPTIONS even on the health path", () => {
    assert.equal(shouldInstrumentInstagramHealthDiag(createHealthReq({ method: "OPTIONS" })), false);
  });
});

describe("instagram health diag redaction", () => {
  const NESTED_JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFBP95ZtAI0";
  const NESTED_META_TOKEN = "EAAGabcdefghijklmnopqrstuvwxyz0123456789token";
  const NESTED_OPAQUE =
    "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_secret_opaque_value_xx";
  const NESTED_CLIENT_SECRET = "ig_client_secret_value_do_not_log";
  const NESTED_API_KEY = "ig_api_key_value_do_not_log";

  function assertSerializedHasNoSecrets(
    payload: unknown,
    secrets: string[],
  ): void {
    const serialized = JSON.stringify(payload);
    for (const secret of secrets) {
      assert.equal(
        serialized.includes(secret),
        false,
        `serialized payload must not contain ${JSON.stringify(secret)}`,
      );
    }
    assert.equal(serialized.toLowerCase().includes("bearer "), false);
  }

  it("drops sensitive keys and redacts token-like string values", () => {
    const sanitized = sanitizeInstagramHealthDiagFields({
      instagramHealthDiag: true,
      requestId: "r1",
      correlationId: "c1",
      stage: "supabase_auth",
      event: "start",
      authorization: "Bearer leaked",
      accessToken: "tok",
      note: "Bearer abc.def.ghi",
      safe: "ok",
    });
    const record = sanitized as Record<string, unknown>;
    assert.equal(sanitized.instagramHealthDiag, true);
    assert.equal(record.safe, "ok");
    assert.equal("authorization" in sanitized, false);
    assert.equal("accessToken" in sanitized, false);
    assert.equal(record.note, "[REDACTED]");
    assertSerializedHasNoSecrets(sanitized, ["leaked", "Bearer abc.def.ghi"]);
  });

  it("redacts nested objects/arrays and alternate sensitive key names", () => {
    const sanitized = sanitizeInstagramHealthDiagFields({
      instagramHealthDiag: true,
      requestId: "req-nested",
      correlationId: "corr-nested",
      stage: "credentials_load",
      event: "start",
      hasAuthorization: true,
      meta: {
        client_secret: NESTED_CLIENT_SECRET,
        apiKey: NESTED_API_KEY,
        token: NESTED_META_TOKEN,
        Authorization: `Bearer ${NESTED_OPAQUE}`,
        app_secret: "nested_app_secret",
        refresh_token: "nested_refresh",
        verify_token: "nested_verify",
        safeLabel: "credentials_ok",
        nestedAgain: {
          access_token: NESTED_JWT,
          password: "nested-password",
          cookie: "session=abc",
        },
      },
      items: [
        { api_key: "array_api_key", ok: true },
        NESTED_JWT,
        { deep: [{ secret: "array_secret", keep: "visible" }] },
      ],
    });
    const record = sanitized as Record<string, unknown>;
    const meta = record.meta as Record<string, unknown>;
    const nestedAgain = meta.nestedAgain as Record<string, unknown>;
    const items = record.items as unknown[];

    assert.equal(record.hasAuthorization, true);
    assert.equal(meta.safeLabel, "credentials_ok");
    assert.equal("client_secret" in meta, false);
    assert.equal("apiKey" in meta, false);
    assert.equal("token" in meta, false);
    assert.equal("Authorization" in meta, false);
    assert.equal("app_secret" in meta, false);
    assert.equal("refresh_token" in meta, false);
    assert.equal("verify_token" in meta, false);
    assert.equal("access_token" in nestedAgain, false);
    assert.equal("password" in nestedAgain, false);
    assert.equal("cookie" in nestedAgain, false);
    assert.equal(items[0] && typeof items[0] === "object" && "api_key" in (items[0] as object), false);
    assert.equal((items[0] as Record<string, unknown>).ok, true);
    assert.equal(items[1], "[REDACTED]");
    assert.equal(
      ((items[2] as { deep: Array<Record<string, unknown>> }).deep[0] as Record<string, unknown>).keep,
      "visible",
    );
    assert.equal(
      "secret" in ((items[2] as { deep: Array<Record<string, unknown>> }).deep[0] as object),
      false,
    );

    assertSerializedHasNoSecrets(sanitized, [
      NESTED_JWT,
      NESTED_META_TOKEN,
      NESTED_OPAQUE,
      NESTED_CLIENT_SECRET,
      NESTED_API_KEY,
      "nested_app_secret",
      "nested_refresh",
      "nested_verify",
      "nested-password",
      "session=abc",
      "array_api_key",
      "array_secret",
    ]);
  });

  it("redacts token-like strings without a Bearer prefix", () => {
    const sanitized = sanitizeInstagramHealthDiagFields({
      instagramHealthDiag: true,
      requestId: "req-tokenish",
      correlationId: "corr-tokenish",
      stage: "meta_health",
      event: "end",
      jwt: NESTED_JWT,
      graphCred: NESTED_META_TOKEN,
      // Built at runtime so the source file never contains a scanner-flagged sk_live_* literal.
      stripeLike: ["sk", "live", "abcdefghijklmnopqrstuvwx"].join("_"),
      opaque: NESTED_OPAQUE,
      uuidSafe: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
      shortSafe: "ok",
    });
    const record = sanitized as Record<string, unknown>;
    const stripeLikeValue = ["sk", "live", "abcdefghijklmnopqrstuvwx"].join("_");
    assert.equal(record.jwt, "[REDACTED]");
    assert.equal(record.graphCred, "[REDACTED]");
    assert.equal(record.stripeLike, "[REDACTED]");
    assert.equal(record.opaque, "[REDACTED]");
    assert.equal(record.uuidSafe, "2d27f7fb-c15e-4d60-84e9-1793f36f2172");
    assert.equal(record.shortSafe, "ok");
    assertSerializedHasNoSecrets(sanitized, [
      NESTED_JWT,
      NESTED_META_TOKEN,
      stripeLikeValue,
      NESTED_OPAQUE,
    ]);
  });

  it("preserves requestId and correlationId from request context", () => {
    const fields = buildInstagramHealthDiagFields({
      req: { requestId: "req-keep", correlationId: "corr-keep" },
      stage: "meta_health",
      event: "start",
    });
    assert.equal(fields.requestId, "req-keep");
    assert.equal(fields.correlationId, "corr-keep");
  });

  it("does not invent replacement ids when missing", () => {
    const fields = buildInstagramHealthDiagFields({
      req: {},
      stage: "channel_lookup",
      event: "start",
    });
    assert.equal(fields.requestId, undefined);
    assert.equal(fields.correlationId, undefined);
  });

  it("records hasAuthorization without authorization header values", () => {
    const fields = buildInstagramHealthDiagFields({
      req: createHealthReq(),
      stage: "supabase_auth",
      event: "start",
      hasAuthorization: true,
    });
    const serialized = JSON.stringify(fields);
    assert.equal(fields.hasAuthorization, true);
    assert.equal(serialized.includes("SECRET_TOKEN_VALUE"), false);
    assert.equal(serialized.toLowerCase().includes("bearer "), false);
  });

  it("passes only sanitized fields to logger.info via logInstagramHealthStage", () => {
    const captured: Array<{ fields: unknown; message: unknown }> = [];
    const originalInfo = logger.info.bind(logger);
    logger.info = ((fields: unknown, message?: unknown) => {
      captured.push({ fields, message });
    }) as typeof logger.info;

    try {
      const unsafe = {
        ...buildInstagramHealthDiagFields({
          req: createHealthReq(),
          stage: "credentials_load",
          event: "end",
          completion: "async",
          durationMs: 12,
          hasAuthorization: true,
        }),
        detail: {
          client_secret: NESTED_CLIENT_SECRET,
          apiKey: NESTED_API_KEY,
          token: NESTED_META_TOKEN,
          nested: [
            NESTED_JWT,
            { Authorization: `Bearer ${NESTED_OPAQUE}` },
            { graphCred: NESTED_META_TOKEN, keep: "visible" },
          ],
        },
      } as InstagramHealthDiagLogFields;

      logInstagramHealthStage(unsafe, "instagram.channel-outbound-health stage");

      assert.equal(captured.length, 1);
      const loggedFields = captured[0]?.fields as Record<string, unknown>;
      assert.equal(loggedFields.instagramHealthDiag, true);
      assert.equal(loggedFields.hasAuthorization, true);
      assert.equal(loggedFields.stage, "credentials_load");
      assert.equal(captured[0]?.message, "instagram.channel-outbound-health stage");

      const detail = loggedFields.detail as Record<string, unknown>;
      assert.equal("client_secret" in detail, false);
      assert.equal("apiKey" in detail, false);
      assert.equal("token" in detail, false);
      const nested = detail.nested as unknown[];
      assert.equal(nested[0], "[REDACTED]");
      assert.equal("Authorization" in (nested[1] as object), false);
      assert.equal((nested[2] as Record<string, unknown>).keep, "visible");
      assert.equal((nested[2] as Record<string, unknown>).graphCred, "[REDACTED]");

      // Exact object received by logger.info — not a re-sanitized copy.
      assert.equal(captured[0]?.fields, loggedFields);
      assertSerializedHasNoSecrets(captured[0]?.fields, [
        NESTED_CLIENT_SECRET,
        NESTED_API_KEY,
        NESTED_META_TOKEN,
        NESTED_JWT,
        NESTED_OPAQUE,
        "SECRET_TOKEN_VALUE",
      ]);
    } finally {
      logger.info = originalInfo;
    }
  });

  it("redacts values beyond the depth cap so nested secrets cannot bypass sanitization", () => {
    const deepSecret = NESTED_META_TOKEN;
    let deep: Record<string, unknown> = { leaf: deepSecret };
    for (let i = 0; i < 12; i++) {
      deep = { wrap: deep };
    }

    const sanitized = sanitizeInstagramHealthDiagFields({
      instagramHealthDiag: true,
      requestId: "req-depth",
      correlationId: "corr-depth",
      stage: "meta_health",
      event: "start",
      deep,
      shallowSafe: "ok",
    });
    const serialized = JSON.stringify(sanitized);

    assert.equal((sanitized as Record<string, unknown>).shallowSafe, "ok");
    assert.equal(serialized.includes(deepSecret), false);
    assert.equal(serialized.includes("[REDACTED]"), true);
    // Past the cap the subtree collapses; no further object descent emits the leaf.
    assert.equal(serialized.includes('"leaf"'), false);
  });

  it("handles circular references without leaking secrets or throwing on serialize", () => {
    const circ: Record<string, unknown> = {
      a: "ok",
      client_secret: NESTED_CLIENT_SECRET,
      apiKey: NESTED_API_KEY,
      cred: NESTED_JWT,
    };
    circ.self = circ;
    circ.bag = { token: NESTED_META_TOKEN, next: circ };

    const sanitized = sanitizeInstagramHealthDiagFields({
      instagramHealthDiag: true,
      requestId: "req-circ",
      correlationId: "corr-circ",
      stage: "credentials_load",
      event: "end",
      circ,
    });

    let serialized = "";
    assert.doesNotThrow(() => {
      serialized = JSON.stringify(sanitized);
    });
    assert.equal((sanitized as Record<string, unknown>).requestId, "req-circ");
    assertSerializedHasNoSecrets(sanitized, [
      NESTED_CLIENT_SECRET,
      NESTED_API_KEY,
      NESTED_JWT,
      NESTED_META_TOKEN,
    ]);
    assert.equal(serialized.includes("client_secret"), false);
    assert.equal(serialized.includes("apiKey"), false);
    assert.equal(serialized.includes('"token"'), false);
  });
});

describe("wrapInstagramHealthMiddleware outcomes", () => {
  it("logs start+end once when next() succeeds and preserves correlation ids", async () => {
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createHealthReq();
    const res = createFakeRes();
    const wrapped = wrapInstagramHealthMiddleware(
      "supabase_auth",
      (_req, _res, next) => next(),
      (fields) => sink.push(fields),
    );

    await new Promise<void>((resolve, reject) => {
      wrapped(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
    });

    assert.equal(sink.length, 2);
    assert.equal(sink[0]?.event, "start");
    assert.equal(sink[1]?.event, "end");
    assert.equal(sink[1]?.completion, "next");
    assert.equal(sink[0]?.requestId, "req-diag-1");
    assert.equal(sink[0]?.correlationId, "corr-diag-1");
    assert.equal(sink[1]?.requestId, "req-diag-1");
    assert.equal(sink[1]?.correlationId, "corr-diag-1");
  });

  it("logs start+error once when next(err) is called", async () => {
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createHealthReq();
    const res = createFakeRes();
    const boom = new HttpError(401, "Invalid or expired session.", "unauthorized");
    const wrapped = wrapInstagramHealthMiddleware(
      "company_scope",
      (_req, _res, next) => next(boom),
      (fields) => sink.push(fields),
    );

    await new Promise<void>((resolve) => {
      wrapped(req, res, () => resolve());
    });

    assert.equal(sink.length, 2);
    assert.equal(sink[1]?.event, "error");
    assert.equal(sink[1]?.completion, "next_error");
    assert.equal(sink[1]?.errorCode, "unauthorized");
    assert.equal(sink[1]?.errorName, "HttpError");
    assert.equal(sink[1]?.statusCode, 401);
  });

  it("logs start+end once when middleware responds without calling next()", async () => {
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createHealthReq();
    const res = createFakeRes();
    const wrapped = wrapInstagramHealthMiddleware(
      "supabase_auth",
      (_req, innerRes) => {
        innerRes.statusCode = 401;
        (innerRes as FakeRes).headersSent = true;
        (innerRes as FakeRes).writableEnded = true;
        queueMicrotask(() => innerRes.emit("finish"));
      },
      (fields) => sink.push(fields),
    );

    await new Promise<void>((resolve) => {
      wrapped(req, res, () => {
        assert.fail("next should not be called");
      });
      const check = () => {
        if (sink.length >= 2) resolve();
        else queueMicrotask(check);
      };
      check();
    });

    assert.equal(sink.length, 2);
    assert.equal(sink[1]?.event, "end");
    assert.equal(sink[1]?.completion, "response_finished");
    assert.equal(sink[1]?.statusCode, 401);
  });

  it("logs start+error once on premature close", async () => {
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createHealthReq();
    const res = createFakeRes();
    const wrapped = wrapInstagramHealthMiddleware(
      "supabase_auth",
      () => {
        queueMicrotask(() => res.emit("close"));
      },
      (fields) => sink.push(fields),
    );

    await new Promise<void>((resolve) => {
      wrapped(req, res, () => {
        assert.fail("next should not be called");
      });
      const check = () => {
        if (sink.length >= 2) resolve();
        else queueMicrotask(check);
      };
      check();
    });

    assert.equal(sink.length, 2);
    assert.equal(sink[1]?.event, "error");
    assert.equal(sink[1]?.completion, "response_closed");
  });

  it("does not duplicate stage logs when finish follows next()", async () => {
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createHealthReq();
    const res = createFakeRes();
    const wrapped = wrapInstagramHealthMiddleware(
      "supabase_auth",
      (_req, _res, next) => next(),
      (fields) => sink.push(fields),
    );

    await new Promise<void>((resolve, reject) => {
      wrapped(req, res, (err?: unknown) => {
        if (err) reject(err);
        else {
          res.writableEnded = true;
          res.emit("finish");
          resolve();
        }
      });
    });

    assert.equal(sink.length, 2);
    assert.equal(sink.filter((row) => row.event === "end").length, 1);
    assert.equal(sink[1]?.completion, "next");
  });

  it("does not emit diagnostic logs for non-health Instagram paths", async () => {
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createHealthReq({
      originalUrl: "/api/instagram/oauth/start",
      url: "/api/instagram/oauth/start",
      path: "/instagram/oauth/start",
    });
    const res = createFakeRes();
    let called = false;
    const wrapped = wrapInstagramHealthMiddleware(
      "supabase_auth",
      (_req, _res, next) => {
        called = true;
        next();
      },
      (fields) => sink.push(fields),
    );

    await new Promise<void>((resolve, reject) => {
      wrapped(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
    });

    assert.equal(called, true);
    assert.equal(sink.length, 0);
  });
});

describe("instagram health stage timeouts", () => {
  it("times out hung auth middleware with direct JSON+CORS (no bare proxy 502)", async () => {
    assert.equal(INSTAGRAM_HEALTH_PRE_META_STAGE_TIMEOUT_MS, 10_000);
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createCorsHealthReq();
    const res = createFakeRes();
    let nextCalled = false;
    const wrapped = wrapInstagramHealthMiddleware(
      "supabase_auth",
      () => {
        /* never calls next — simulates hung getUser / network */
      },
      (fields) => sink.push(fields),
      { timeoutMs: 40 },
    );

    wrapped(req, res, () => {
      nextCalled = true;
    });

    await new Promise<void>((resolve) => {
      const check = () => {
        if (res.writableEnded) resolve();
        else setTimeout(check, 5);
      };
      check();
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 504);
    assert.equal((res.body as { code?: string; error?: string }).error, "instagram_health_stage_timeout");
    assert.equal(res.headers["access-control-allow-origin"], "https://valueor.org");
    assert.equal(sink.some((row) => row.event === "error" && row.stage === "supabase_auth"), true);
  });

  it("hard deadline writes JSON+CORS when the whole health request hangs", async () => {
    assert.equal(INSTAGRAM_HEALTH_HARD_DEADLINE_MS, 45_000);
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createCorsHealthReq();
    const res = createFakeRes();
    const wrapped = wrapInstagramHealthHardDeadline((fields) => sink.push(fields), {
      deadlineMs: 40,
    });

    wrapped(req, res, () => {
      /* leave request open */
    });

    await new Promise<void>((resolve) => {
      const check = () => {
        if (res.writableEnded) resolve();
        else setTimeout(check, 5);
      };
      check();
    });

    assert.equal(res.statusCode, 504);
    assert.equal((res.body as { error?: string }).error, "instagram_health_deadline");
    assert.equal(res.headers["access-control-allow-origin"], "https://valueor.org");
    assert.equal(sink.some((row) => row.stage === "request_deadline"), true);
  });

  it("ignores late next() after stage timeout so the CORS JSON response stays intact", async () => {
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createCorsHealthReq();
    const res = createFakeRes();
    let lateNext: ((err?: unknown) => void) | undefined;
    const wrapped = wrapInstagramHealthMiddleware(
      "supabase_auth",
      (_req, _res, next) => {
        lateNext = next;
      },
      (fields) => sink.push(fields),
      { timeoutMs: 30 },
    );

    let outerNextCount = 0;
    wrapped(req, res, () => {
      outerNextCount += 1;
    });

    await new Promise<void>((resolve) => {
      const check = () => {
        if (res.writableEnded) resolve();
        else setTimeout(check, 5);
      };
      check();
    });

    assert.ok(lateNext);
    lateNext();
    assert.equal(outerNextCount, 0);
    assert.equal(res.statusCode, 504);
    assert.equal(res.headers["access-control-allow-origin"], "https://valueor.org");
  });

  it("times out hung credentials_load work", async () => {
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createHealthReq();
    await assert.rejects(
      () =>
        timeInstagramHealthStage(
          req,
          "credentials_load",
          () => new Promise(() => {}),
          (fields) => sink.push(fields),
          { timeoutMs: 40 },
        ),
      (error: unknown) =>
        error instanceof HttpError &&
        error.statusCode === 504 &&
        error.code === "instagram_health_stage_timeout",
    );
    assert.equal(sink.some((row) => row.event === "error"), true);
  });
});

describe("timeInstagramHealthStage", () => {
  it("logs start+end once for async success", async () => {
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createHealthReq();
    const value = await timeInstagramHealthStage(
      req,
      "channel_lookup",
      async () => 42,
      (fields) => sink.push(fields),
    );
    assert.equal(value, 42);
    assert.equal(sink.length, 2);
    assert.equal(sink[0]?.event, "start");
    assert.equal(sink[1]?.event, "end");
    assert.equal(sink[1]?.completion, "async");
    assert.equal(sink[1]?.correlationId, "corr-diag-1");
  });

  it("logs start+error once and rethrows", async () => {
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createHealthReq();
    await assert.rejects(
      () =>
        timeInstagramHealthStage(
          req,
          "credentials_load",
          async () => {
            throw new HttpError(400, "bad", "validation_error");
          },
          (fields) => sink.push(fields),
        ),
      /bad/,
    );
    assert.equal(sink.length, 2);
    assert.equal(sink[1]?.event, "error");
    assert.equal(sink[1]?.errorCode, "validation_error");
  });

  it("skips instrumentation for non-health paths", async () => {
    const sink: InstagramHealthDiagLogFields[] = [];
    const req = createHealthReq({
      originalUrl: "/api/instagram/webhooks",
      url: "/api/instagram/webhooks",
      path: "/instagram/webhooks",
    });
    const value = await timeInstagramHealthStage(
      req,
      "meta_health",
      async () => "ok",
      (fields) => sink.push(fields),
    );
    assert.equal(value, "ok");
    assert.equal(sink.length, 0);
  });
});
