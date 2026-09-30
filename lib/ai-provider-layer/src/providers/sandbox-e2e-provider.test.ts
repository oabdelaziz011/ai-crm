import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  createSandboxE2EProvider,
  getSandboxE2EInvocations,
  resetSandboxE2EInvocations,
  setSandboxE2EForcedFailures,
  SANDBOX_E2E_PROVIDER_KEY,
} from "./sandbox-e2e-provider.js";
import type { GatewayChatRequest } from "../models/request-response.js";

function request(patch: Partial<GatewayChatRequest> = {}): GatewayChatRequest {
  return {
    context: { companyId: "co-a", conversationId: "conv-1", executionId: "ex-1" },
    messages: [{ role: "user", content: "I need help with my order." }],
    ...patch,
  };
}

describe("sandbox E2E LLM provider", () => {
  beforeEach(() => {
    resetSandboxE2EInvocations();
    setSandboxE2EForcedFailures(0);
  });

  it("returns a deterministic assistant reply and records company/conversation context", async () => {
    const provider = createSandboxE2EProvider({ model: "sandbox-e2e" });
    const response = await provider.chatCompletion(request());
    assert.equal(provider.key, SANDBOX_E2E_PROVIDER_KEY);
    assert.match(response.text, /I need help with my order/);
    assert.equal(response.providerKey, "sandbox");
    assert.equal(getSandboxE2EInvocations().length, 1);
    assert.equal(getSandboxE2EInvocations()[0]?.companyId, "co-a");
    assert.equal(getSandboxE2EInvocations()[0]?.conversationId, "conv-1");
    assert.equal(getSandboxE2EInvocations()[0]?.userMessage, "I need help with my order.");
  });

  it("emits escalate_to_human when the visitor asks for a human and the tool is offered", async () => {
    const provider = createSandboxE2EProvider({});
    const response = await provider.chatCompletion(
      request({
        messages: [{ role: "user", content: "Please transfer this conversation now." }],
        tools: [{ type: "function", function: { name: "escalate_to_human" } }],
      }),
    );
    assert.equal(response.finishReason, "tool_calls");
    assert.equal(response.toolCalls?.[0]?.name, "escalate_to_human");
  });

  it("returns a confirmation after escalate_to_human already ran in the tool loop", async () => {
    const provider = createSandboxE2EProvider({});
    const response = await provider.chatCompletion(
      request({
        messages: [
          { role: "user", content: "Please transfer this conversation now." },
          { role: "tool", content: "{\"escalated\":true}", toolCallId: "sandbox_escalate_1" },
        ],
        tools: [{ type: "function", function: { name: "escalate_to_human" } }],
      }),
    );
    assert.equal(response.finishReason, "stop");
    assert.match(response.text, /human teammate/i);
  });

  it("throws on forced failures so the existing runtime retry/failure path can run", async () => {
    setSandboxE2EForcedFailures(1);
    const provider = createSandboxE2EProvider({});
    await assert.rejects(() => provider.chatCompletion(request()), /Sandbox LLM simulated failure/);
  });
});
