import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WHATSAPP_MESSAGES_USAGE_METRIC_CODE,
  WHATSAPP_CHANNEL_FEATURE_CODE,
} from "@workspace/channel-platform";
import { createWhatsAppMessagesCommercialPort } from "./whatsapp-messages-commercial-adapter.js";
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

describe("createWhatsAppMessagesCommercialPort", () => {
  it("1. entitlement denied → BLOCK", async () => {
    const { client } = mockClient(() => ({ data: false, error: null }));
    const port = createWhatsAppMessagesCommercialPort(client as never);
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: false, reason: "not_entitled" });
  });

  it("2. no quota → ALLOW", async () => {
    const port = createWhatsAppMessagesCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => noQuota,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: true, reason: "entitled" });
  });

  it("3. under quota → ALLOW", async () => {
    const port = createWhatsAppMessagesCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(5),
      resolveMonthlyUsage: async () => 4,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: true, reason: "entitled" });
  });

  it("4. quota exceeded → BLOCK", async () => {
    const port = createWhatsAppMessagesCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(2),
      resolveMonthlyUsage: async () => 2,
    });
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: false, reason: "quota_exceeded" });
  });

  it("5. overage allowed → ALLOW without charge", async () => {
    const port = createWhatsAppMessagesCommercialPort(entitledClient(), {
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

  it("6. successful send → exactly one usage event", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") return { data: "usage-1", error: null };
      return { data: null, error: null };
    });
    const port = createWhatsAppMessagesCommercialPort(client as never);
    const result = await port.recordUsage({
      companyId: "c1",
      externalMessageId: "wamid.out-1",
      deliveryEventId: "delivery-1",
      companyChannelId: "channel-1",
    });
    assert.equal(result.recorded, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.fn, "ingest_usage_event");
    assert.equal(calls[0]?.args.p_metric_code, WHATSAPP_MESSAGES_USAGE_METRIC_CODE);
    assert.equal(calls[0]?.args.p_company_id, "c1");
    assert.equal(calls[0]?.args.p_quantity, 1);
  });

  it("7. failed ingest → zero recorded usage", async () => {
    const { client } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") return { data: null, error: { message: "db error" } };
      return { data: null, error: null };
    });
    const port = createWhatsAppMessagesCommercialPort(client as never);
    const result = await port.recordUsage({
      companyId: "c1",
      externalMessageId: "wamid.out-1",
    });
    assert.equal(result.recorded, false);
    assert.equal(result.reason, "ingest_failed");
  });

  it("8. missing externalMessageId → zero usage events", async () => {
    const { client, calls } = mockClient(() => ({ data: null, error: null }));
    const port = createWhatsAppMessagesCommercialPort(client as never);
    const result = await port.recordUsage({
      companyId: "c1",
      externalMessageId: "",
    });
    assert.equal(result.recorded, false);
    assert.equal(result.reason, "missing_ids");
    assert.equal(calls.length, 0);
  });

  it("9. idempotency key includes companyId", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") return { data: "usage-1", error: null };
      return { data: null, error: null };
    });
    const port = createWhatsAppMessagesCommercialPort(client as never);
    await port.recordUsage({ companyId: "co-a", externalMessageId: "wamid.x" });
    assert.equal(calls[0]?.args.p_idempotency_key, "whatsapp_messages:co-a:wamid.x");
  });

  it("10. duplicate externalMessageId → idempotent usage", async () => {
    let ingestCalls = 0;
    const { client } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") {
        ingestCalls += 1;
        return { data: ingestCalls === 1 ? "usage-1" : null, error: null };
      }
      return { data: null, error: null };
    });
    const port = createWhatsAppMessagesCommercialPort(client as never);
    const first = await port.recordUsage({ companyId: "c1", externalMessageId: "wamid.dup" });
    const second = await port.recordUsage({ companyId: "c1", externalMessageId: "wamid.dup" });
    assert.equal(first.recorded, true);
    assert.equal(second.recorded, false);
    assert.equal(second.reason, "duplicate_or_empty");
    assert.equal(ingestCalls, 2);
  });

  it("11. company A cannot meter company B quota decision", async () => {
    const usageByCompany: Record<string, number> = { "co-a": 0, "co-b": 5 };
    const port = createWhatsAppMessagesCommercialPort(entitledClient(), {
      resolveQuotaPolicy: async () => planPolicy(3),
      resolveMonthlyUsage: async (companyId) => usageByCompany[companyId] ?? 0,
    });
    const a = await port.checkAccess({ companyId: "co-a" });
    const b = await port.checkAccess({ companyId: "co-b" });
    assert.equal(a.allowed, true);
    assert.equal(b.allowed, false);
    assert.equal(b.reason, "quota_exceeded");
  });

  it("12. same wamid across companies does not collide", async () => {
    const keys: string[] = [];
    const { client } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") {
        keys.push(String(call.args.p_idempotency_key));
        return { data: `usage-${keys.length}`, error: null };
      }
      return { data: null, error: null };
    });
    const port = createWhatsAppMessagesCommercialPort(client as never);
    const a = await port.recordUsage({ companyId: "co-a", externalMessageId: "wamid.shared" });
    const b = await port.recordUsage({ companyId: "co-b", externalMessageId: "wamid.shared" });
    assert.equal(a.recorded, true);
    assert.equal(b.recorded, true);
    assert.deepEqual(keys, [
      "whatsapp_messages:co-a:wamid.shared",
      "whatsapp_messages:co-b:wamid.shared",
    ]);
  });

  it("uses is_feature_enabled with whatsapp_channel feature code", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "is_feature_enabled") return { data: true, error: null };
      return { data: null, error: null };
    });
    const port = createWhatsAppMessagesCommercialPort(client as never, {
      resolveQuotaPolicy: async () => noQuota,
    });
    await port.checkAccess({ companyId: "c1" });
    assert.equal(calls[0]?.fn, "is_feature_enabled");
    assert.equal(calls[0]?.args.p_feature_code, WHATSAPP_CHANNEL_FEATURE_CODE);
    assert.equal(calls[0]?.args.p_company_id, "c1");
  });

  it("blocks when not entitled regardless of quota", async () => {
    const port = createWhatsAppMessagesCommercialPort(
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
});
