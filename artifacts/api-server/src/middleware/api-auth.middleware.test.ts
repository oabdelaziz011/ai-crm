import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Request, Response } from "express";
import { createApiAuthMiddleware } from "./api-auth-middleware.js";
import type { ApiCallsCommercialPort } from "../lib/quota/api-calls-commercial-adapter.js";

type ResponseState = { statusCode: number; body: unknown; ended: boolean };

function mockResponse(): { res: Response; state: ResponseState } {
  const state: ResponseState = { statusCode: 200, body: null, ended: false };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      state.body = payload;
      state.ended = true;
      return this;
    },
  } as unknown as Response;
  return { res, state };
}

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: { authorization: "Bearer valid-token" },
    method: "GET",
    path: "/customers",
    requestId: "req-mw-1",
    correlationId: "corr-mw-1",
    ip: "127.0.0.1",
    ...overrides,
  } as Request;
}

const baseCtx = {
  companyId: "co-auth",
  authType: "api_key" as const,
  authId: "key-1",
  scopes: ["customers.read"],
  ipAddress: "127.0.0.1",
};

describe("createApiAuthMiddleware + api_calls commercial gate", () => {
  const recordCalls: Array<{ companyId: string; requestId: string }> = [];

  afterEach(() => {
    recordCalls.length = 0;
  });

  function buildMiddleware(input: {
    entitled?: boolean;
    rateLimitAllowed?: boolean;
    quotaDecision?: ApiCallsCommercialPort["checkQuota"];
    recordUsage?: ApiCallsCommercialPort["recordUsage"];
  }) {
    const commercial: ApiCallsCommercialPort = {
      checkQuota:
        input.quotaDecision ??
        (async () => ({ allowed: true, reason: "allowed" })),
      recordUsage:
        input.recordUsage ??
        (async (usageInput) => {
          recordCalls.push({ companyId: usageInput.companyId, requestId: usageInput.requestId });
          return { recorded: true, reason: "recorded" };
        }),
    };

    return createApiAuthMiddleware({
      authenticateBearer: async () => baseCtx,
      isApiAccessEntitled: async () => input.entitled ?? true,
      checkRateLimit: () => input.rateLimitAllowed ?? true,
      apiCallsCommercial: commercial,
    });
  }

  it("9. allowed request records exactly ONE api_calls usage event", async () => {
    const middleware = buildMiddleware({});
    const req = mockRequest();
    const { res, state } = mockResponse();
    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(recordCalls.length, 1);
    assert.equal(recordCalls[0]?.companyId, "co-auth");
    assert.equal(recordCalls[0]?.requestId, "req-mw-1");
    assert.equal(state.statusCode, 200);
  });

  it("10. quota-exceeded request records ZERO usage events", async () => {
    const middleware = buildMiddleware({
      quotaDecision: async () => ({ allowed: false, reason: "quota_exceeded" }),
    });
    const req = mockRequest();
    const { res, state } = mockResponse();
    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(recordCalls.length, 0);
    assert.equal(state.statusCode, 403);
    assert.equal((state.body as { error?: { code?: string } })?.error?.code, "QUOTA_EXCEEDED");
  });

  it("11. rate-limited request records ZERO commercial usage events", async () => {
    const middleware = buildMiddleware({ rateLimitAllowed: false });
    const req = mockRequest();
    const { res, state } = mockResponse();
    await middleware(req, res, () => {});

    assert.equal(recordCalls.length, 0);
    assert.equal(state.statusCode, 429);
    assert.equal((state.body as { error?: { code?: string } })?.error?.code, "RATE_LIMITED");
  });

  it("12. unauthenticated request records ZERO usage events", async () => {
    const middleware = buildMiddleware({});
    const req = mockRequest({ headers: {} });
    const { res, state } = mockResponse();
    await middleware(req, res, () => {});

    assert.equal(recordCalls.length, 0);
    assert.equal(state.statusCode, 401);
  });

  it("8. api_access entitlement denied → BLOCK regardless of quota", async () => {
    const middleware = buildMiddleware({ entitled: false });
    const req = mockRequest();
    const { res, state } = mockResponse();
    await middleware(req, res, () => {});

    assert.equal(recordCalls.length, 0);
    assert.equal(state.statusCode, 403);
    assert.equal((state.body as { error?: { code?: string } })?.error?.code, "FEATURE_NOT_ENTITLED");
  });

  it("13. usage is attributed to authenticated company only", async () => {
    const middleware = buildMiddleware({
      quotaDecision: async ({ companyId }) => {
        assert.equal(companyId, "co-auth");
        return { allowed: true, reason: "allowed" };
      },
    });
    const req = mockRequest();
    const { res } = mockResponse();
    await middleware(req, res, () => {});
    assert.equal(recordCalls[0]?.companyId, "co-auth");
  });

  it("16. usage recording failure still dispatches request", async () => {
    const middleware = buildMiddleware({
      recordUsage: async () => {
        throw new Error("ingest failed");
      },
    });
    const req = mockRequest();
    const { res } = mockResponse();
    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  it("18. QUOTA_EXCEEDED remains distinct from RATE_LIMITED", async () => {
    const quotaMiddleware = buildMiddleware({
      quotaDecision: async () => ({ allowed: false, reason: "quota_exceeded" }),
    });
    const { res: quotaRes, state: quotaState } = mockResponse();
    await quotaMiddleware(mockRequest(), quotaRes, () => {});

    const rateMiddleware = buildMiddleware({ rateLimitAllowed: false });
    const { res: rateRes, state: rateState } = mockResponse();
    await rateMiddleware(mockRequest(), rateRes, () => {});

    assert.equal((quotaState.body as { error?: { code?: string } })?.error?.code, "QUOTA_EXCEEDED");
    assert.equal((rateState.body as { error?: { code?: string } })?.error?.code, "RATE_LIMITED");
  });

  it("15. rate limiting hook remains invoked before commercial quota", async () => {
    const order: string[] = [];
    const middleware = createApiAuthMiddleware({
      authenticateBearer: async () => baseCtx,
      isApiAccessEntitled: async () => {
        order.push("entitlement");
        return true;
      },
      checkRateLimit: () => {
        order.push("rate_limit");
        return true;
      },
      apiCallsCommercial: {
        checkQuota: async () => {
          order.push("quota");
          return { allowed: true, reason: "allowed" };
        },
        recordUsage: async () => ({ recorded: true }),
      },
    });

    const req = mockRequest();
    const { res } = mockResponse();
    await middleware(req, res, () => {});
    assert.deepEqual(order, ["entitlement", "rate_limit", "quota"]);
  });
});
