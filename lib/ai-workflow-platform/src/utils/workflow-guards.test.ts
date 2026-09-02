import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_KNOWLEDGE_SEARCH_NODE_KEY } from "../nodes/knowledge-search/constants.js";
import { AI_SUMMARIZER_NODE_KEY } from "../nodes/summarizer/constants.js";
import {
  assertWorkflowAiNodeExecutionAllowed,
  assertWorkflowAutomationEnabled,
  WorkflowAiFeatureDisabledError,
  WorkflowAiNodeFeatureDisabledError,
  WorkflowKnowledgeNodeFeatureDisabledError,
  WorkflowToolLoopFeatureDisabledError,
} from "./workflow-guards.js";
import type { AIWorkflowServiceContext } from "../adapters/ai-workflow-execution-adapter.js";

function serviceContext(
  overrides?: Partial<AIWorkflowServiceContext>,
): AIWorkflowServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: () => true,
    isWorkflowFeatureEnabled: () => true,
    isAiChatFeatureEnabled: () => true,
    isToolCallingFeatureEnabled: () => true,
    isKnowledgeFeatureEnabled: () => true,
    isEmbeddingsFeatureEnabled: () => true,
    hasLlmTools: () => true,
    ...overrides,
  };
}

describe("ai-workflow-platform workflow guards", () => {
  it("A workflow flag true → ALLOW", () => {
    assert.doesNotThrow(() => assertWorkflowAutomationEnabled(serviceContext()));
  });

  it("B workflow flag false → DENY", () => {
    assert.throws(
      () => assertWorkflowAutomationEnabled(serviceContext({ isWorkflowFeatureEnabled: () => false })),
      WorkflowAiFeatureDisabledError,
    );
  });

  it("E callback returns undefined → DENY", () => {
    assert.throws(
      () =>
        assertWorkflowAutomationEnabled(
          serviceContext({ isWorkflowFeatureEnabled: () => undefined as unknown as boolean }),
        ),
      WorkflowAiFeatureDisabledError,
    );
  });

  it("F callback throws → DENY", () => {
    assert.throws(
      () =>
        assertWorkflowAutomationEnabled(
          serviceContext({
            isWorkflowFeatureEnabled: () => {
              throw new Error("boom");
            },
          }),
        ),
      WorkflowAiFeatureDisabledError,
    );
  });

  it("H AI workflow callback missing → DENY", () => {
    assert.throws(
      () =>
        assertWorkflowAutomationEnabled(
          serviceContext({ isWorkflowFeatureEnabled: undefined }),
        ),
      WorkflowAiFeatureDisabledError,
    );
  });

  it("L missing company context → DENY", () => {
    assert.throws(
      () => assertWorkflowAutomationEnabled(serviceContext({ companyId: null })),
      WorkflowAiFeatureDisabledError,
    );
  });

  it("AI LLM node feature callbacks: missing → DENY", () => {
    assert.throws(
      () =>
        assertWorkflowAiNodeExecutionAllowed(
          serviceContext({ isAiChatFeatureEnabled: undefined }),
          { nodeKey: AI_SUMMARIZER_NODE_KEY, conversationId: "session-1" },
        ),
      WorkflowAiNodeFeatureDisabledError,
    );
  });

  it("allows AI LLM node when automation and ai_chat enabled", () => {
    assert.doesNotThrow(() =>
      assertWorkflowAiNodeExecutionAllowed(serviceContext(), {
        nodeKey: AI_SUMMARIZER_NODE_KEY,
        conversationId: "session-1",
      }),
    );
  });

  it("blocks AI LLM node when ai_chat disabled", () => {
    assert.throws(
      () =>
        assertWorkflowAiNodeExecutionAllowed(
          serviceContext({ isAiChatFeatureEnabled: () => false }),
          { nodeKey: AI_SUMMARIZER_NODE_KEY, conversationId: "session-1" },
        ),
      WorkflowAiNodeFeatureDisabledError,
    );
  });

  it("blocks tool loop when tool_calling disabled", () => {
    assert.throws(
      () =>
        assertWorkflowAiNodeExecutionAllowed(
          serviceContext({ isToolCallingFeatureEnabled: () => false }),
          { nodeKey: AI_SUMMARIZER_NODE_KEY, conversationId: "session-1" },
        ),
      WorkflowToolLoopFeatureDisabledError,
    );
  });

  it("allows knowledge-search node when knowledge and embeddings enabled", () => {
    assert.doesNotThrow(() =>
      assertWorkflowAiNodeExecutionAllowed(serviceContext(), {
        nodeKey: AI_KNOWLEDGE_SEARCH_NODE_KEY,
        conversationId: "session-1",
      }),
    );
  });

  it("blocks knowledge-search node when knowledge disabled", () => {
    assert.throws(
      () =>
        assertWorkflowAiNodeExecutionAllowed(
          serviceContext({ isKnowledgeFeatureEnabled: () => false }),
          { nodeKey: AI_KNOWLEDGE_SEARCH_NODE_KEY, conversationId: "session-1" },
        ),
      WorkflowKnowledgeNodeFeatureDisabledError,
    );
  });

  it("allows super-admin regardless of flags", () => {
    assert.doesNotThrow(() =>
      assertWorkflowAiNodeExecutionAllowed(
        serviceContext({
          isSuperAdmin: true,
          isWorkflowFeatureEnabled: () => false,
          isAiChatFeatureEnabled: () => false,
        }),
        { nodeKey: AI_SUMMARIZER_NODE_KEY, conversationId: "session-1" },
      ),
    );
  });
});
