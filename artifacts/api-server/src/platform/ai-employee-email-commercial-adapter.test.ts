import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_EMPLOYEE_EMAIL_USAGE_METRIC_CODE,
  AI_EMPLOYEE_FEATURE_CODE,
} from "@workspace/channel-platform";
import { createAiEmployeeEmailCommercialPort } from "./ai-employee-email-commercial-adapter.js";
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

function planPolicy(included: number, source: EffectiveQuotaPolicy["source"] = "plan_limit"): EffectiveQuotaPolicy {
  return {
    configured: true,
    included_quantity: included,
    unlimited: false,
    overage_allowed: false,
    overage_unit_size: null,
    overage_unit_price: null,
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

describe("createAiEmployeeEmailCommercialPort", () => {
  it("1. entitlement denied → BLOCK", async () => {
    const { client } = mockClient(() => ({ data: false, error: null }));
    const port = createAiEmployeeEmailCommercialPort(client as never);
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: false, reason: "not_entitled" });
  });

  it("2. no quota → ALLOW", async () => {
    const port = createAiEmployeeEmailCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => noQuota,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: true, reason: "entitled" });
  });

  it("3. plan quota under limit → ALLOW", async () => {
    const port = createAiEmployeeEmailCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(5),
      resolveMonthlyUsage: async () => 4,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: true, reason: "entitled" });
  });

  it("4. plan quota at limit + overage false → BLOCK", async () => {
    const port = createAiEmployeeEmailCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(2),
      resolveMonthlyUsage: async () => 2,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: false, reason: "quota_exceeded" });
  });

  it("5. plan quota over limit + overage false → BLOCK", async () => {
    const port = createAiEmployeeEmailCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(2),
      resolveMonthlyUsage: async () => 5,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: false, reason: "quota_exceeded" });
  });

  it("6. company override overrides plan", async () => {
    const port = createAiEmployeeEmailCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => ({
        configured: true,
        included_quantity: 10,
        unlimited: false,
        overage_allowed: false,
        overage_unit_size: null,
        overage_unit_price: null,
        source: "company_override",
      }),
      resolveMonthlyUsage: async () => 8,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: true, reason: "entitled" });
  });

  it("7. unlimited company override → ALLOW", async () => {
    const port = createAiEmployeeEmailCommercialPort(entitledClient(), {
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
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: true, reason: "entitled" });
  });

  it("8. overage allowed → ALLOW without charge", async () => {
    const port = createAiEmployeeEmailCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => ({
        configured: true,
        included_quantity: 2,
        unlimited: false,
        overage_allowed: true,
        overage_unit_size: 100,
        overage_unit_price: 5,
        source: "company_override",
      }),
      resolveMonthlyUsage: async () => 10,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: true, reason: "entitled" });
  });

  it("blocks when not entitled regardless of quota", async () => {
    const port = createAiEmployeeEmailCommercialPort(
      {
        rpc: async (fn: string) => {
          if (fn === "is_feature_enabled") return { data: false, error: null };
          return { data: null, error: null };
        },
        from: () => ({}) as never,
      } as never,
      {
        resolveQuotaPolicy: async () => planPolicy(999),
        resolveMonthlyUsage: async () => 0,
      },
    );
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: false, reason: "not_entitled" });
  });

  it("10. successful email → exactly ONE usage record via tenant-scoped idempotency", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") return { data: "usage-1", error: null };
      return { data: null, error: null };
    });
    const port = createAiEmployeeEmailCommercialPort(client as never);
    const result = await port.recordUsage({
      companyId: "c1",
      inboundEventId: "evt-1",
      aiEmployeeId: "emp-1",
    });
    assert.equal(result.recorded, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.fn, "ingest_usage_event");
    assert.equal(calls[0]?.args.p_metric_code, AI_EMPLOYEE_EMAIL_USAGE_METRIC_CODE);
    assert.equal(calls[0]?.args.p_company_id, "c1");
  });

  it("12. usage recording failure preserves best-effort semantics", async () => {
    const { client } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") return { data: null, error: { message: "db error" } };
      return { data: null, error: null };
    });
    const port = createAiEmployeeEmailCommercialPort(client as never);
    const result = await port.recordUsage({
      companyId: "c1",
      inboundEventId: "evt-1",
    });
    assert.equal(result.recorded, false);
    assert.equal(result.reason, "ingest_failed");
  });

  it("14. idempotency key contains company_id", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") return { data: "usage-1", error: null };
      return { data: null, error: null };
    });
    const port = createAiEmployeeEmailCommercialPort(client as never);
    await port.recordUsage({ companyId: "co-a", inboundEventId: "evt-x" });
    assert.equal(calls[0]?.args.p_idempotency_key, "ai_employee_email:co-a:evt-x");
  });

  it("15. repeated same company + inbound event does not double-count", async () => {
    let ingestCalls = 0;
    const { client } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") {
        ingestCalls += 1;
        return { data: ingestCalls === 1 ? "usage-1" : null, error: null };
      }
      return { data: null, error: null };
    });
    const port = createAiEmployeeEmailCommercialPort(client as never);
    const first = await port.recordUsage({ companyId: "c1", inboundEventId: "evt-dup" });
    const second = await port.recordUsage({ companyId: "c1", inboundEventId: "evt-dup" });
    assert.equal(first.recorded, true);
    assert.equal(second.recorded, false);
    assert.equal(second.reason, "duplicate_or_empty");
    assert.equal(ingestCalls, 2);
  });

  it("16. same inbound event ID across different companies does not collide", async () => {
    const keys: string[] = [];
    const { client } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") {
        keys.push(String(call.args.p_idempotency_key));
        return { data: `usage-${keys.length}`, error: null };
      }
      return { data: null, error: null };
    });
    const port = createAiEmployeeEmailCommercialPort(client as never);
    const a = await port.recordUsage({ companyId: "co-a", inboundEventId: "shared-evt" });
    const b = await port.recordUsage({ companyId: "co-b", inboundEventId: "shared-evt" });
    assert.equal(a.recorded, true);
    assert.equal(b.recorded, true);
    assert.deepEqual(keys, [
      "ai_employee_email:co-a:shared-evt",
      "ai_employee_email:co-b:shared-evt",
    ]);
  });

  it("17. billing period uses YYYY-MM via ingest recorded_at", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") return { data: "usage-1", error: null };
      return { data: null, error: null };
    });
    const port = createAiEmployeeEmailCommercialPort(client as never);
    await port.recordUsage({ companyId: "c1", inboundEventId: "evt-1" });
    const ingest = calls.find((call) => call.fn === "ingest_usage_event");
    assert.ok(ingest);
    const recordedAt = String(ingest.args.p_recorded_at ?? "");
    assert.match(recordedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(recordedAt.slice(0, 7), new Date().toISOString().slice(0, 7));
  });

  it("uses is_feature_enabled with ai_employee feature code", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "is_feature_enabled") return { data: true, error: null };
      return { data: null, error: null };
    });
    const port = createAiEmployeeEmailCommercialPort(client as never, {
      resolveQuotaPolicy: async () => noQuota,
    });
    await port.checkAccess({ companyId: "c1" });
    assert.equal(calls[0]?.fn, "is_feature_enabled");
    assert.equal(calls[0]?.args.p_feature_code, AI_EMPLOYEE_FEATURE_CODE);
    assert.equal(calls[0]?.args.p_company_id, "c1");
  });

  it("13. company A usage cannot affect company B quota decision", async () => {
    const usageByCompany: Record<string, number> = { "co-a": 0, "co-b": 5 };
    const port = createAiEmployeeEmailCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(3),
      resolveMonthlyUsage: async (companyId) => usageByCompany[companyId] ?? 0,
    });
    const a = await port.checkAccess({ companyId: "co-a" });
    const b = await port.checkAccess({ companyId: "co-b" });
    assert.equal(a.allowed, true);
    assert.equal(b.allowed, false);
    assert.equal(b.reason, "quota_exceeded");
  });
});
