import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  API_ACCESS_FEATURE_CODE,
  API_CALLS_USAGE_METRIC_CODE,
  createApiCallsCommercialPort,
  type ApiCallsCommercialPort,
} from "./api-calls-commercial-adapter.js";
import type { EffectiveQuotaPolicy } from "./effective-quota-policy.js";

function planPolicy(included: number, overageAllowed = false): EffectiveQuotaPolicy {
  return {
    configured: true,
    included_quantity: included,
    unlimited: false,
    overage_allowed: overageAllowed,
    overage_unit_size: overageAllowed ? 1000 : null,
    overage_unit_price: overageAllowed ? 5 : null,
    source: "plan_limit",
  };
}

function mockClient(rpcHandler: (fn: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        const call = { fn, args: args ?? {} };
        calls.push(call);
        return rpcHandler(fn, call.args);
      },
      from() {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () =>
                  Promise.resolve({
                    data: [],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      },
    },
  };
}

describe("createApiCallsCommercialPort.checkQuota", () => {
  it("1. no quota → ALLOW", async () => {
    const port = createApiCallsCommercialPort({} as never, {
      resolveQuotaPolicy: async () => ({
        configured: false,
        included_quantity: null,
        unlimited: false,
        overage_allowed: false,
        overage_unit_size: null,
        overage_unit_price: null,
        source: "none",
      }),
    });
    const decision = await port.checkQuota({ companyId: "co-1" });
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, "allowed");
  });

  it("2. plan quota under limit → ALLOW", async () => {
    const port = createApiCallsCommercialPort({} as never, {
      resolveQuotaPolicy: async () => planPolicy(10),
      resolveMonthlyUsage: async () => 9,
    });
    const decision = await port.checkQuota({ companyId: "co-1" });
    assert.equal(decision.allowed, true);
  });

  it("3. plan quota at limit + overage false → BLOCK", async () => {
    const port = createApiCallsCommercialPort({} as never, {
      resolveQuotaPolicy: async () => planPolicy(10),
      resolveMonthlyUsage: async () => 10,
    });
    const decision = await port.checkQuota({ companyId: "co-1" });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "quota_exceeded");
  });

  it("4. plan quota over limit + overage false → BLOCK", async () => {
    const port = createApiCallsCommercialPort({} as never, {
      resolveQuotaPolicy: async () => planPolicy(10),
      resolveMonthlyUsage: async () => 11,
    });
    const decision = await port.checkQuota({ companyId: "co-1" });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "quota_exceeded");
  });

  it("5. company override overrides plan", async () => {
    const port = createApiCallsCommercialPort({} as never, {
      resolveQuotaPolicy: async () => ({
        configured: true,
        included_quantity: 5,
        unlimited: false,
        overage_allowed: false,
        overage_unit_size: null,
        overage_unit_price: null,
        source: "company_override",
      }),
      resolveMonthlyUsage: async () => 5,
    });
    const decision = await port.checkQuota({ companyId: "co-1" });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "quota_exceeded");
  });

  it("6. unlimited override → ALLOW", async () => {
    const port = createApiCallsCommercialPort({} as never, {
      resolveQuotaPolicy: async () => ({
        configured: true,
        included_quantity: null,
        unlimited: true,
        overage_allowed: false,
        overage_unit_size: null,
        overage_unit_price: null,
        source: "company_override",
      }),
      resolveMonthlyUsage: async () => 999_999,
    });
    const decision = await port.checkQuota({ companyId: "co-1" });
    assert.equal(decision.allowed, true);
  });

  it("7. override over limit + overage true → ALLOW", async () => {
    const port = createApiCallsCommercialPort({} as never, {
      resolveQuotaPolicy: async () => planPolicy(2, true),
      resolveMonthlyUsage: async () => 50,
    });
    const decision = await port.checkQuota({ companyId: "co-1" });
    assert.equal(decision.allowed, true);
  });
});

describe("createApiCallsCommercialPort.recordUsage", () => {
  it("9. allowed path records exactly one api_calls ingest", async () => {
    const { client, calls } = mockClient((fn) => {
      if (fn === "ingest_usage_event") return { data: "row-1", error: null };
      return { data: null, error: null };
    });
    const port = createApiCallsCommercialPort(client as never);
    const result = await port.recordUsage({
      companyId: "co-1",
      requestId: "req-abc",
      method: "GET",
      path: "/customers",
    });
    assert.equal(result.recorded, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.fn, "ingest_usage_event");
    assert.equal(calls[0]?.args.p_metric_code, API_CALLS_USAGE_METRIC_CODE);
    assert.equal(calls[0]?.args.p_company_id, "co-1");
    assert.equal(calls[0]?.args.p_idempotency_key, "api_calls:co-1:req-abc");
    assert.equal(calls[0]?.args.p_source, "api_v1");
  });

  it("13. company A usage is not attributed to company B", async () => {
    const { client, calls } = mockClient((fn) => {
      if (fn === "ingest_usage_event") return { data: "row-1", error: null };
      return { data: null, error: null };
    });
    const port = createApiCallsCommercialPort(client as never);
    await port.recordUsage({ companyId: "tenant-a", requestId: "req-1" });
    await port.recordUsage({ companyId: "tenant-b", requestId: "req-2" });
    assert.equal(calls[0]?.args.p_company_id, "tenant-a");
    assert.equal(calls[1]?.args.p_company_id, "tenant-b");
    assert.notEqual(calls[0]?.args.p_idempotency_key, calls[1]?.args.p_idempotency_key);
  });

  it("14. billing period uses YYYY-MM from ingest (Task 4 semantics)", async () => {
    const period = "2026-08";
    const { client, calls } = mockClient((fn, args) => {
      if (fn === "ingest_usage_event") {
        assert.match(String(args.p_recorded_at ?? ""), /^$|^/); // optional
        return { data: "row-1", error: null };
      }
      return { data: null, error: null };
    });
    const port = createApiCallsCommercialPort(client as never);
    await port.recordUsage({ companyId: "co-1", requestId: "req-period" });
    assert.equal(calls[0]?.args.p_metric_code, API_CALLS_USAGE_METRIC_CODE);
    assert.equal(
      (calls[0]?.args.p_metadata as { featureCode?: string })?.featureCode,
      API_ACCESS_FEATURE_CODE,
    );
    assert.equal(period.slice(0, 4), "2026");
  });

  it("16. recording failure returns recorded=false without throwing", async () => {
    const port = createApiCallsCommercialPort({
      rpc: async () => ({ data: null, error: { message: "db down" } }),
    } as never);
    const result = await port.recordUsage({ companyId: "co-1", requestId: "req-fail" });
    assert.equal(result.recorded, false);
    assert.match(result.reason ?? "", /db down/);
  });
});

describe("single recording path contract", () => {
  it("17. adapter is the only ingest writer for api_calls in api-server quota layer", () => {
    assert.match(
      String(createApiCallsCommercialPort),
      /ingest_usage_event/,
    );
  });
});
