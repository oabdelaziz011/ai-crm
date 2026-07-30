import type { AIWorkflowServiceContext } from "../adapters/ai-workflow-execution-adapter.js";
import { AI_KNOWLEDGE_SEARCH_NODE_KEY } from "../nodes/knowledge-search/constants.js";

export class WorkflowAiFeatureDisabledError extends Error {
  readonly code = "WORKFLOW_AI_FEATURE_DISABLED";

  constructor(message = "Workflow AI is disabled for this company.") {
    super(message);
    this.name = "WorkflowAiFeatureDisabledError";
  }
}

export class WorkflowAiNodeFeatureDisabledError extends Error {
  readonly code = "WORKFLOW_AI_NODE_FEATURE_DISABLED";

  constructor(message = "AI workflow nodes are disabled for this company.") {
    super(message);
    this.name = "WorkflowAiNodeFeatureDisabledError";
  }
}

export class WorkflowKnowledgeNodeFeatureDisabledError extends Error {
  readonly code = "WORKFLOW_KNOWLEDGE_NODE_FEATURE_DISABLED";

  constructor(message = "Knowledge search workflow nodes are disabled for this company.") {
    super(message);
    this.name = "WorkflowKnowledgeNodeFeatureDisabledError";
  }
}

export class WorkflowToolLoopFeatureDisabledError extends Error {
  readonly code = "WORKFLOW_TOOL_LOOP_FEATURE_DISABLED";

  constructor(message = "Tool calling is disabled for this company.") {
    super(message);
    this.name = "WorkflowToolLoopFeatureDisabledError";
  }
}

function readFlag(enabled?: () => boolean): boolean {
  return enabled?.() ?? true;
}

export function assertWorkflowAutomationEnabled(ctx: AIWorkflowServiceContext): void {
  if (ctx.isSuperAdmin) return;
  if (ctx.isWorkflowFeatureEnabled && !ctx.isWorkflowFeatureEnabled()) {
    throw new WorkflowAiFeatureDisabledError();
  }
}

export function assertWorkflowAiNodeExecutionAllowed(
  ctx: AIWorkflowServiceContext,
  input: { nodeKey: string; conversationId?: string | null },
): void {
  assertWorkflowAutomationEnabled(ctx);
  if (ctx.isSuperAdmin) return;

  if (input.nodeKey === AI_KNOWLEDGE_SEARCH_NODE_KEY) {
    const knowledgeOk = readFlag(ctx.isKnowledgeFeatureEnabled);
    const embeddingsOk = readFlag(ctx.isEmbeddingsFeatureEnabled);
    if (!knowledgeOk || !embeddingsOk) {
      throw new WorkflowKnowledgeNodeFeatureDisabledError();
    }
    return;
  }

  const aiChatOk = readFlag(ctx.isAiChatFeatureEnabled);
  if (!aiChatOk) {
    throw new WorkflowAiNodeFeatureDisabledError();
  }

  const mayUseToolLoop = Boolean(input.conversationId && ctx.hasLlmTools?.());
  if (mayUseToolLoop && !readFlag(ctx.isToolCallingFeatureEnabled)) {
    throw new WorkflowToolLoopFeatureDisabledError();
  }
}
