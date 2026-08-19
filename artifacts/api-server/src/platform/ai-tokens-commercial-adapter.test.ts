import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_ASSISTANT_FEATURE_CODE,
  AI_TOKENS_USAGE_METRIC_CODE,
} from "@workspace/ai-execution-engine";
import { createAiTokensCommercialPort } from "./ai-tokens-commercial-adapter.js";
import type { EffectiveQuotaPolicy } from "../lib/quota/effective-quota-policy.js";

type RpcCall = { fn: string; args: Record<string, unknown> };

function mockClient(handler: (call: RpcCall) => { data: unknown; error: unknown }) {
  const calls: RpcCall[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        const call = { fn, args };
        calls.push(call);
        return handler(call);
      },
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
            return Promise.resolve(resolve({ data: [], error: null }));
          },
        };
      },
    },
  };
}

function entitledClient() {
  return {
    rpc: async (fn: string) => {
      if (fn === "is_feature_enabled") return { data: true, error: null };
      return { data: null, error: null };
    },
    from: () => ({}) as never,
  } as never;
}

function planPolicy(
  included: number,
  source: EffectiveQuotaPolicy["source"] = "plan_limit",
  overage = false,
): EffectiveQuotaPolicy {
  return {
    configured: true,
    included_quantity: included,
    unlimited: false,
    overage_allowed: overage,
    overage_unit_size: overage ? 1000 : null,
    overage_unit_price: overage ? 1 : null,
    source,
  };
}

const noQuota: EffectiveQuotaPolicy = {
  configured: false,
  included_quantity: null,
  unlimited: false,
  overage_allowed: false,
  overage_unit_size: null,
  overage_unit_price: null,
  source: "none",
};

describe("createAiTokensCommercialPort", () => {
  it("A. entitlement denied → BLOCK", async () => {
    const { client } = mockClient(() => ({ data: false, error: null }));
    const port = createAiTokensCommercialPort(client as never);
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: false, reason: "not_entitled" });
  });

  it("C. no quota → ALLOW", async () => {
    const port = createAiTokensCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => noQuota,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: true, reason: "entitled" });
  });

  it("B. quota exceeded → BLOCK", async () => {
    const port = createAiTokensCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(100),
      resolveMonthlyUsage: async () => 100,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: false, reason: "quota_exceeded" });
  });

  it("L. overage allowed → ALLOW without charge", async () => {
    const port = createAiTokensCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(100, "company_override", true),
      resolveMonthlyUsage: async () => 500,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: true, reason: "entitled" });
  });

  it("D. records quantity 100 with tenant-scoped idempotency", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") return { data: "usage-1", error: null };
      return { data: null, error: null };
    });
    const port = createAiTokensCommercialPort(client as never);
    const result = await port.recordUsage({
      companyId: "co-a",
      executionId: "exec-1",
      quantity: 100,
    });
    assert.equal(result.recorded, true);
    assert.equal(calls[0]?.fn, "ingest_usage_event");
    assert.equal(calls[0]?.args.p_metric_code, AI_TOKENS_USAGE_METRIC_CODE);
    assert.equal(calls[0]?.args.p_quantity, 100);
    assert.equal(calls[0]?.args.p_company_id, "co-a");
    assert.equal(calls[0]?.args.p_idempotency_key, "ai_tokens:co-a:exec-1");
    assert.equal(calls[0]?.args.p_reference_id, "exec-1");
  });

  it("J. duplicate execution is idempotent", async () => {
    let ingestCalls = 0;
    const { client } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") {
        ingestCalls += 1;
        return { data: ingestCalls === 1 ? "usage-1" : null, error: null };
      }
      return { data: null, error: null };
    });
    const port = createAiTokensCommercialPort(client as never);
    const first = await port.recordUsage({
      companyId: "c1",
      executionId: "exec-dup",
      quantity: 40,
    });
    const second = await port.recordUsage({
      companyId: "c1",
      executionId: "exec-dup",
      quantity: 40,
    });
    assert.equal(first.recorded, true);
    assert.equal(second.recorded, false);
    assert.equal(second.reason, "duplicate_or_empty");
  });

  it("K. same execution id across companies does not collide", async () => {
    const keys: string[] = [];
    const { client } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") {
        keys.push(String(call.args.p_idempotency_key));
        return { data: `usage-${keys.length}`, error: null };
      }
      return { data: null, error: null };
    });
    const port = createAiTokensCommercialPort(client as never);
    await port.recordUsage({ companyId: "co-a", executionId: "shared-exec", quantity: 10 });
    await port.recordUsage({ companyId: "co-b", executionId: "shared-exec", quantity: 10 });
    assert.deepEqual(keys, ["ai_tokens:co-a:shared-exec", "ai_tokens:co-b:shared-exec"]);
  });

  it("M. zero quantity is not ingested", async () => {
    const { client, calls } = mockClient(() => ({ data: null, error: null }));
    const port = createAiTokensCommercialPort(client as never);
    const result = await port.recordUsage({
      companyId: "c1",
      executionId: "exec-0",
      quantity: 0,
    });
    assert.equal(result.recorded, false);
    assert.equal(result.reason, "invalid_quantity");
    assert.equal(calls.length, 0);
  });

  it("uses is_feature_enabled with ai_assistant", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "is_feature_enabled") return { data: true, error: null };
      return { data: null, error: null };
    });
    const port = createAiTokensCommercialPort(client as never, {
      resolveQuotaPolicy: async () => noQuota,
    });
    await port.checkAccess({ companyId: "c1" });
    assert.equal(calls[0]?.fn, "is_feature_enabled");
    assert.equal(calls[0]?.args.p_feature_code, AI_ASSISTANT_FEATURE_CODE);
    assert.equal(calls[0]?.args.p_company_id, "c1");
  });

  it("company A usage cannot affect company B quota decision", async () => {
    const usageByCompany: Record<string, number> = { "co-a": 10, "co-b": 200 };
    const port = createAiTokensCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(50),
      resolveMonthlyUsage: async (companyId) => usageByCompany[companyId] ?? 0,
    });
    const a = await port.checkAccess({ companyId: "co-a" });
    const b = await port.checkAccess({ companyId: "co-b" });
    assert.equal(a.allowed, true);
    assert.equal(b.allowed, false);
    assert.equal(b.reason, "quota_exceeded");
  });
});
