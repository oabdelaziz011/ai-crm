import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_EMAIL_ROUTING_FEATURE_CODE,
  AI_EMAIL_ROUTING_USAGE_METRIC_CODE,
} from "@workspace/channel-platform";
import { createAiEmailRoutingCommercialPort } from "./ai-email-routing-commercial-adapter.js";

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

  it("allows when entitled and no quota limit is configured", async () => {
    const { client } = mockClient((call) => {
      if (call.fn === "is_feature_enabled") return { data: true, error: null };
      if (call.fn === "get_company_entitlements") {
        return {
          data: [
            {
              feature_code: AI_EMAIL_ROUTING_FEATURE_CODE,
              enabled: true,
              limit_value: {},
            },
          ],
          error: null,
        };
      }
      return { data: null, error: { message: "unexpected" } };
    });
    const port = createAiEmailRoutingCommercialPort(client as never);
    const access = await port.checkAccess({ companyId: "co-1" });
    assert.equal(access.allowed, true);
    assert.equal(access.reason, "entitled");
  });

  it("enforces quota when limit_value.monthly is configured", async () => {
    const port = createAiEmailRoutingCommercialPort(
      {
        rpc: async (fn: string) => {
          if (fn === "is_feature_enabled") return { data: true, error: null };
          return { data: null, error: null };
        },
        from: () => ({}) as never,
      } as never,
      {
        resolveMonthlyLimit: async () => 2,
        resolveMonthlyUsage: async () => 2,
      },
    );
    const access = await port.checkAccess({ companyId: "co-1" });
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "quota_exceeded");
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
