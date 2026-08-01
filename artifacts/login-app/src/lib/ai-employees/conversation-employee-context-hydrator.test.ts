import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY } from "./utilities/agent-employee-execution-context.js";
import {
  buildEmployeeConversationMetadataPatch,
  hydrateEmployeeExecutionContext,
  hydrateExecutionContextFromConversationMetadata,
  serializeExecutionContextForConversationMetadata,
} from "./utilities/conversation-employee-context-hydrator.js";
import { clearConversationExecutionContext } from "./utilities/employee-conversation-binding.js";
import type { AgentRuntimeChannelBinding } from "./adapters/ai-employee-runtime-types.js";
import { createAgentEmployeeExecutionContext } from "./utilities/agent-employee-execution-context.js";

function sampleChannelRuntime(): AgentRuntimeChannelBinding {
  return {
    providerConnectionId: "employee-provider-hydrator",
    knowledgeRetrieval: null,
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
      aiEmployeeId: "employee-hydrator-1",
      allowedToolKeys: ["search_customer"],
      employeeName: "Hydrator Employee",
    },
  };
}

describe("ConversationEmployeeContextHydrator", () => {
  it("hydrates execution context from conversation metadata without resolve", () => {
    const executionContext = createAgentEmployeeExecutionContext(sampleChannelRuntime(), {
      module: "agents",
      aiEmployeeId: "employee-hydrator-1",
    });
    const metadata = buildEmployeeConversationMetadataPatch({}, executionContext);

    clearConversationExecutionContext("conv-hydrator-1");
    const hydrated = hydrateEmployeeExecutionContext({
      companyId: "company-hydrator-1",
      conversationId: "conv-hydrator-1",
      basePageContext: { module: "agents" },
      conversationMetadata: metadata,
    });

    assert.equal(hydrated.source, "conversation_metadata");
    assert.equal(hydrated.executionContext?.aiEmployeeId, "employee-hydrator-1");
    assert.deepEqual(hydrated.executionContext?.allowedToolKeys, ["search_customer"]);

    clearConversationExecutionContext("conv-hydrator-1");
  });

  it("serializes and reads the existing employeeExecutionContext shape", () => {
    const executionContext = createAgentEmployeeExecutionContext(sampleChannelRuntime(), {
      module: "agents",
    });
    const serialized = serializeExecutionContextForConversationMetadata(executionContext);
    const metadata = {
      aiEmployeeId: executionContext.aiEmployeeId,
      [AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY]: serialized,
    };

    const restored = hydrateExecutionContextFromConversationMetadata(metadata);
    assert.equal(restored?.aiEmployeeId, executionContext.aiEmployeeId);
    assert.equal(restored?.providerConnectionId, executionContext.providerConnectionId);
  });
});
