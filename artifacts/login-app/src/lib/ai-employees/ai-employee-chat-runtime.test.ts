import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY } from "./utilities/agent-employee-execution-context.js";
import { clearConversationExecutionContext } from "./utilities/employee-conversation-binding.js";
import { prepareEmployeeChatRuntime } from "./utilities/prepare-employee-chat-runtime.js";
import { createAgentEmployeeExecutionContext } from "./utilities/agent-employee-execution-context.js";
import { buildEmployeeConversationMetadataPatch } from "./utilities/conversation-employee-context-hydrator.js";
import type { AgentRuntimeChannelBinding } from "./adapters/ai-employee-runtime-types.js";

function sampleChannelRuntime(): AgentRuntimeChannelBinding {
  return {
    providerConnectionId: "employee-provider-chat",
    knowledgeRetrieval: {
      embeddingConnectionId: "embed-chat-1",
      vectorStoreConnectionId: "vector-chat-1",
      collectionId: "collection-chat-1",
      topK: 5,
      minScore: 0.7,
      sourceIds: ["kb-chat-1"],
    },
    executionPolicy: {
      streaming: true,
      maxDurationMs: 120_000,
      temperature: 0.4,
      maxTokens: 2048,
      retryCount: 1,
      rateLimitPerMinute: 60,
      maxConcurrency: 1,
    },
    pageContext: {
      aiEmployeeId: "employee-chat-1",
      allowedToolKeys: ["search_customer"],
      employeeName: "Chat Employee",
    },
  };
}

describe("prepareEmployeeChatRuntime", () => {
  it("resolves binding once and reuses stored context on subsequent messages", async () => {
    const channelRuntime = sampleChannelRuntime();
    let resolveCount = 0;

    const first = await prepareEmployeeChatRuntime({
      companyId: "company-chat-1",
      conversationId: "conv-chat-1",
      basePageContext: { module: "agents", aiEmployeeId: "employee-chat-1" },
      bindingResolver: async () => {
        resolveCount += 1;
        return channelRuntime;
      },
    });

    assert.equal(first.resolveCount, 1);
    assert.equal(first.executionContext?.aiEmployeeId, "employee-chat-1");
    assert.ok(first.pageContext[AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY]);

    const second = await prepareEmployeeChatRuntime({
      companyId: "company-chat-1",
      conversationId: "conv-chat-1",
      basePageContext: { module: "agents" },
      bindingResolver: async () => {
        resolveCount += 1;
        return channelRuntime;
      },
    });

    assert.equal(second.reusedExistingContext, true);
    assert.equal(second.resolveCount, 0);
    assert.equal(second.executionContext, first.executionContext);
    assert.equal(resolveCount, 1);

    clearConversationExecutionContext("conv-chat-1");
  });

  it("hydrates execution context from conversation metadata without resolve", async () => {
    const channelRuntime = sampleChannelRuntime();
    const executionContext = createAgentEmployeeExecutionContext(channelRuntime, {
      module: "agents",
      aiEmployeeId: "employee-chat-1",
    });
    const metadata = buildEmployeeConversationMetadataPatch({}, executionContext);

    clearConversationExecutionContext("conv-chat-metadata");

    const result = await prepareEmployeeChatRuntime({
      companyId: "company-chat-3",
      conversationId: "conv-chat-metadata",
      basePageContext: { module: "agents" },
      conversationMetadata: metadata,
      bindingResolver: async () => {
        throw new Error("resolveEmployeeChannelRuntime should not be called");
      },
    });

    assert.equal(result.hydrationSource, "conversation_metadata");
    assert.equal(result.resolveCount, 0);
    assert.equal(result.executionContext?.aiEmployeeId, "employee-chat-1");

    clearConversationExecutionContext("conv-chat-metadata");
  });

  it("reuses a complete binding snapshot even when preferFreshBinding is set", async () => {
    const channelRuntime = sampleChannelRuntime();
    const executionContext = createAgentEmployeeExecutionContext(channelRuntime, {
      module: "agents",
      aiEmployeeId: "employee-chat-1",
      systemPrompt: "You are a helpful sales employee.",
      transferableFlowId: "flow-1",
    });
    const metadata = buildEmployeeConversationMetadataPatch({}, executionContext, {
      publishedVersionId: "version-1",
      displayName: "Chat Employee",
    });

    clearConversationExecutionContext("conv-chat-fresh");

    let resolveCount = 0;
    const result = await prepareEmployeeChatRuntime({
      companyId: "company-chat-4",
      conversationId: "conv-chat-fresh",
      aiEmployeeId: "employee-chat-1",
      basePageContext: { module: "omnichannel" },
      conversationMetadata: metadata,
      preferFreshBinding: true,
      bindingResolver: async () => {
        resolveCount += 1;
        return channelRuntime;
      },
    });

    assert.equal(result.reusedExistingContext, true);
    assert.equal(result.resolveCount, 0);
    assert.equal(resolveCount, 0);

    clearConversationExecutionContext("conv-chat-fresh");
  });

  it("returns pass-through when no employee conversation exists", async () => {
    const result = await prepareEmployeeChatRuntime({
      companyId: "company-chat-2",
      conversationId: "conv-chat-2",
      basePageContext: { module: "customers" },
    });

    assert.equal(result.executionContext, null);
    assert.equal(result.resolveCount, 0);
  });
});
