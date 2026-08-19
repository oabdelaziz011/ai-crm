import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_CHANNEL_FEATURE_CODE,
  EMAILS_SENT_USAGE_METRIC_CODE,
} from "@workspace/channel-platform";
import { createEmailsSentCommercialPort } from "./emails-sent-commercial-adapter.js";
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
    overage_unit_size: overage ? 1 : null,
    overage_unit_price: overage ? 0 : null,
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

describe("createEmailsSentCommercialPort", () => {
  it("1. entitlement denied → BLOCK", async () => {
    const { client } = mockClient(() => ({ data: false, error: null }));
    const port = createEmailsSentCommercialPort(client as never);
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: false, reason: "not_entitled" });
  });

  it("2. no quota → ALLOW", async () => {
    const port = createEmailsSentCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => noQuota,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: true, reason: "entitled" });
  });

  it("3. under quota → ALLOW", async () => {
    const port = createEmailsSentCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(5),
      resolveMonthlyUsage: async () => 4,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: true, reason: "entitled" });
  });

  it("4. quota exceeded → BLOCK", async () => {
    const port = createEmailsSentCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(2),
      resolveMonthlyUsage: async () => 2,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: false, reason: "quota_exceeded" });
  });

  it("5. overage allowed → ALLOW without charge", async () => {
    const port = createEmailsSentCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(2, "company_override", true),
      resolveMonthlyUsage: async () => 10,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: true, reason: "entitled" });
  });

  it("6. records quantity 1 with queue-scoped idempotency", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") return { data: "usage-1", error: null };
      return { data: null, error: null };
    });
    const port = createEmailsSentCommercialPort(client as never);
    const result = await port.recordUsage({ companyId: "co-a", queueId: "queue-1" });
    assert.equal(result.recorded, true);
    assert.equal(calls[0]?.fn, "ingest_usage_event");
    assert.equal(calls[0]?.args.p_metric_code, EMAILS_SENT_USAGE_METRIC_CODE);
    assert.equal(calls[0]?.args.p_quantity, 1);
    assert.equal(calls[0]?.args.p_company_id, "co-a");
    assert.equal(calls[0]?.args.p_idempotency_key, "emails_sent:co-a:queue-1");
    assert.equal(calls[0]?.args.p_reference_id, "queue-1");
    assert.equal(calls[0]?.args.p_source, "notification_queue");
  });

  it("7. duplicate queue id is idempotent", async () => {
    let ingestCalls = 0;
    const { client } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") {
        ingestCalls += 1;
        return { data: ingestCalls === 1 ? "usage-1" : null, error: null };
      }
      return { data: null, error: null };
    });
    const port = createEmailsSentCommercialPort(client as never);
    const first = await port.recordUsage({ companyId: "c1", queueId: "queue-dup" });
    const second = await port.recordUsage({ companyId: "c1", queueId: "queue-dup" });
    assert.equal(first.recorded, true);
    assert.equal(second.recorded, false);
    assert.equal(second.reason, "duplicate_or_empty");
  });

  it("8. rejects test/direct queue ids", async () => {
    const { client, calls } = mockClient(() => ({ data: "usage-1", error: null }));
    const port = createEmailsSentCommercialPort(client as never);
    const testResult = await port.recordUsage({ companyId: "c1", queueId: "test" });
    const directResult = await port.recordUsage({ companyId: "c1", queueId: "direct" });
    assert.equal(testResult.recorded, false);
    assert.equal(directResult.recorded, false);
    assert.equal(calls.length, 0);
  });

  it("9. same queue id across companies does not collide", async () => {
    const keys: string[] = [];
    const { client } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") {
        keys.push(String(call.args.p_idempotency_key));
        return { data: `usage-${keys.length}`, error: null };
      }
      return { data: null, error: null };
    });
    const port = createEmailsSentCommercialPort(client as never);
    await port.recordUsage({ companyId: "co-a", queueId: "shared-q" });
    await port.recordUsage({ companyId: "co-b", queueId: "shared-q" });
    assert.deepEqual(keys, ["emails_sent:co-a:shared-q", "emails_sent:co-b:shared-q"]);
  });

  it("uses is_feature_enabled with email_channel", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "is_feature_enabled") return { data: true, error: null };
      return { data: null, error: null };
    });
    const port = createEmailsSentCommercialPort(client as never, {
      resolveQuotaPolicy: async () => noQuota,
    });
    await port.checkAccess({ companyId: "c1" });
    assert.equal(calls[0]?.fn, "is_feature_enabled");
    assert.equal(calls[0]?.args.p_feature_code, EMAIL_CHANNEL_FEATURE_CODE);
  });

  it("company A usage cannot affect company B quota", async () => {
    const usageByCompany: Record<string, number> = { "co-a": 1, "co-b": 50 };
    const port = createEmailsSentCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(10),
      resolveMonthlyUsage: async (companyId) => usageByCompany[companyId] ?? 0,
    });
    const a = await port.checkAccess({ companyId: "co-a" });
    const b = await port.checkAccess({ companyId: "co-b" });
    assert.equal(a.allowed, true);
    assert.equal(b.allowed, false);
    assert.equal(b.reason, "quota_exceeded");
  });
});
