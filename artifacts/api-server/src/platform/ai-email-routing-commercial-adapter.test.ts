import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_EMAIL_ROUTING_FEATURE_CODE,
  AI_EMAIL_ROUTING_USAGE_METRIC_CODE,
} from "@workspace/channel-platform";
import { createAiEmailRoutingCommercialPort } from "./ai-email-routing-commercial-adapter.js";
import type { EffectiveQuotaPolicy } from "../lib/quota/effective-quota-policy.js";

type RpcCall = { fn: string; args: Record<string, unknown> };

function mockClient(handler: (call: RpcCall) => { data: unknown; error: { message: string } | null }) {
  const calls: RpcCall[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        const call = { fn, args: args ?? {} };
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

function planPolicy(included: number): EffectiveQuotaPolicy {
  return {
    configured: true,
    included_quantity: included,
    unlimited: false,
    overage_allowed: false,
    overage_unit_size: null,
    overage_unit_price: null,
    source: "plan_limit",
  };
}

describe("createAiEmailRoutingCommercialPort", () => {
  it("uses is_feature_enabled with ai_email_routing and fails closed on RPC error", async () => {
    const { client, calls } = mockClient(() => ({
      data: null,
      error: { message: "db down" },
    }));
    const port = createAiEmailRoutingCommercialPort(client as never);
    const access = await port.checkAccess({ companyId: "co-1" });
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "entitlement_error");
    assert.equal(calls[0]?.fn, "is_feature_enabled");
    assert.equal(calls[0]?.args.p_feature_code, AI_EMAIL_ROUTING_FEATURE_CODE);
  });

  it("denies when is_feature_enabled returns false", async () => {
    const { client } = mockClient(() => ({ data: false, error: null }));
    const port = createAiEmailRoutingCommercialPort(client as never);
    const access = await port.checkAccess({ companyId: "co-1" });
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "not_entitled");
  });

  it("11. allows when entitled and no quota limit is configured", async () => {
    const { client } = mockClient((call) => {
      if (call.fn === "is_feature_enabled") return { data: true, error: null };
      return { data: null, error: null };
    });
    const port = createAiEmailRoutingCommercialPort(client as never, {
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
    const access = await port.checkAccess({ companyId: "co-1" });
    assert.equal(access.allowed, true);
    assert.equal(access.reason, "entitled");
  });

  it("12. enforces quota when entitled, exceeded, and overage false", async () => {
    const port = createAiEmailRoutingCommercialPort(
      {
        rpc: async (fn: string) => {
          if (fn === "is_feature_enabled") return { data: true, error: null };
          return { data: null, error: null };
        },
        from: () => ({}) as never,
      } as never,
      {
        resolveQuotaPolicy: async () => planPolicy(2),
        resolveMonthlyUsage: async () => 2,
      },
    );
    const access = await port.checkAccess({ companyId: "co-1" });
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "quota_exceeded");
  });

  it("13. allows when entitled, over quota, and overage allowed (no billing)", async () => {
    const port = createAiEmailRoutingCommercialPort(
      {
        rpc: async (fn: string) => {
          if (fn === "is_feature_enabled") return { data: true, error: null };
          return { data: null, error: null };
        },
        from: () => ({}) as never,
      } as never,
      {
        resolveQuotaPolicy: async () => ({
          configured: true,
          included_quantity: 2,
          unlimited: false,
          overage_allowed: true,
          overage_unit_size: 1000,
          overage_unit_price: 5,
          source: "company_override",
        }),
        resolveMonthlyUsage: async () => 5,
      },
    );
    const access = await port.checkAccess({ companyId: "co-1" });
    assert.equal(access.allowed, true);
    assert.equal(access.reason, "entitled");
  });

  it("14. blocks when not entitled regardless of quota", async () => {
    const port = createAiEmailRoutingCommercialPort(
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
    const access = await port.checkAccess({ companyId: "co-1" });
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "not_entitled");
  });

  it("records usage via ingest_usage_event with inbound idempotency key", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "ingest_usage_event") return { data: "usage-row-1", error: null };
      return { data: null, error: null };
    });
    const port = createAiEmailRoutingCommercialPort(client as never);
    const result = await port.recordUsage({
      companyId: "co-1",
      inboundEventId: "evt-9",
      category: "sales",
      source: "llm",
    });
    assert.equal(result.recorded, true);
    assert.equal(calls[0]?.fn, "ingest_usage_event");
    assert.equal(calls[0]?.args.p_metric_code, AI_EMAIL_ROUTING_USAGE_METRIC_CODE);
    assert.equal(calls[0]?.args.p_company_id, "co-1");
    assert.equal(calls[0]?.args.p_idempotency_key, "ai_email_routing:co-1:evt-9");
    assert.equal(calls[0]?.args.p_reference_id, "evt-9");
  });
});
