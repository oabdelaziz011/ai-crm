import type { AIOutputMode, AIWorkflowNodeConfig } from "@workspace/ai-workflow-platform";
import { normalizeAIWorkflowNodeConfig } from "@workspace/ai-workflow-platform";

export function readAIWorkflowConfig(
  config: Record<string, unknown>,
  nodeKey = "custom.ai",
): AIWorkflowNodeConfig {
  const embedded = config.aiConfig;
  if (embedded && typeof embedded === "object") {
    return normalizeAIWorkflowNodeConfig(embedded as Record<string, unknown>, nodeKey);
  }
  return normalizeAIWorkflowNodeConfig(
    {
      nodeKey: typeof config.nodeKey === "string" ? config.nodeKey : nodeKey,
      promptTemplateKey: config.promptTemplateKey,
      providerConnectionId: config.providerConnectionId,
      providerKey: config.providerKey,
      model: config.model,
      outputMode: config.outputMode,
      outputSchema: config.outputSchema,
      outputVariable: config.outputVariable,
      knowledge: config.knowledge,
      policies: config.policies,
      metadata: config.metadata,
    },
    nodeKey,
  );
}

export function patchAIWorkflowConfig(
  config: Record<string, unknown>,
  patch: Partial<AIWorkflowNodeConfig>,
  nodeKey = "custom.ai",
): Record<string, unknown> {
  const current = readAIWorkflowConfig(config, nodeKey);
  return {
    ...config,
    aiConfig: {
      ...current,
      ...patch,
      knowledge: patch.knowledge ? { ...current.knowledge, ...patch.knowledge } : current.knowledge,
      policies: patch.policies ? { ...current.policies, ...patch.policies } : current.policies,
    },
  };
}

export const AI_OUTPUT_MODE_OPTIONS: AIOutputMode[] = [
  "text",
  "json",
  "boolean",
  "classification",
  "structured",
  "array",
];
