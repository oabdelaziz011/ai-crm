import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_EMPLOYEE_EMAIL_USAGE_METRIC_CODE,
  AI_EMPLOYEE_FEATURE_CODE,
} from "@workspace/channel-platform";
import { createAiEmployeeEmailCommercialPort } from "./ai-employee-email-commercial-adapter.js";

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
    },
  };
}

describe("createAiEmployeeEmailCommercialPort", () => {
  it("fail-closed when feature disabled", async () => {
    const { client } = mockClient(() => ({ data: false, error: null }));
    const port = createAiEmployeeEmailCommercialPort(client as never);
    const result = await port.checkAccess({ companyId: "c1" });
    assert.deepEqual(result, { allowed: false, reason: "not_entitled" });
  });

  it("allows when ai_employee entitled", async () => {
    const { client, calls } = mockClient((call) => {
      if (call.fn === "is_feature_enabled") return { data: true, error: null };
      return { data: null, error: null };
    });
    const port = createAiEmployeeEmailCommercialPort(client as never);
    const result = await port.checkAccess({ companyId: "c1" });
    assert.equal(result.allowed, true);
    assert.equal(calls[0]?.args.p_feature_code, AI_EMPLOYEE_FEATURE_CODE);
  });

  it("records usage with inbound idempotency key", async () => {
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
    assert.equal(calls[0]?.fn, "ingest_usage_event");
    assert.equal(calls[0]?.args.p_metric_code, AI_EMPLOYEE_EMAIL_USAGE_METRIC_CODE);
    assert.equal(calls[0]?.args.p_idempotency_key, "ai_employee_email:evt-1");
  });
});
