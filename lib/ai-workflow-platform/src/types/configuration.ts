import type { AIOutputMode, AIWorkflowCapability, AINodeCategory } from "../constants.js";

export type AIWorkflowPolicyConfig = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  streaming?: boolean;
  timeoutMs?: number;
  retryCount?: number;
  responseFormat?: "text" | "json";
};

export type AIWorkflowKnowledgeConfig = {
  enabled: boolean;
  collectionId?: string | null;
  embeddingConnectionId?: string | null;
  vectorStoreConnectionId?: string | null;
  maxChunks?: number;
  similarityThreshold?: number;
  queryTemplate?: string | null;
};

export type AIWorkflowNodeConfig = {
  nodeKey: string;
  nodeVersion?: string;
  promptTemplateKey?: string | null;
  promptTemplateType?: string;
  providerConnectionId?: string | null;
  providerKey?: string | null;
  model?: string | null;
  outputMode: AIOutputMode;
  outputSchema?: Record<string, unknown> | null;
  outputVariable?: string | null;
  knowledge?: AIWorkflowKnowledgeConfig;
  policies?: AIWorkflowPolicyConfig;
  metadata?: Record<string, unknown>;
};

export type AIWorkflowNodeDefinition = {
  key: string;
  displayName: string;
  description: string;
  category: AINodeCategory;
  icon: string;
  version: string;
  capabilities: AIWorkflowCapability[];
  defaultConfig: Partial<AIWorkflowNodeConfig>;
  requiredCapabilities?: AIWorkflowCapability[];
  outputModes: AIOutputMode[];
};

export function createDefaultAIWorkflowNodeConfig(
  nodeKey: string,
  overrides: Partial<AIWorkflowNodeConfig> = {},
): AIWorkflowNodeConfig {
  return {
    nodeKey,
    nodeVersion: "1.0.0",
    promptTemplateKey: null,
    promptTemplateType: "workflow",
    providerConnectionId: null,
    providerKey: null,
    model: null,
    outputMode: "text",
    outputSchema: null,
    outputVariable: null,
    knowledge: {
      enabled: false,
      collectionId: null,
      embeddingConnectionId: null,
      vectorStoreConnectionId: null,
      maxChunks: 8,
      similarityThreshold: 0.7,
      queryTemplate: null,
    },
    policies: {
      temperature: 0.2,
      topP: 1,
      maxTokens: 1024,
      streaming: false,
      timeoutMs: 30_000,
      retryCount: 1,
      responseFormat: "text",
    },
    metadata: {},
    ...overrides,
  };
}

export function normalizeAIWorkflowNodeConfig(
  raw: Record<string, unknown>,
  fallbackNodeKey = "custom",
): AIWorkflowNodeConfig {
  const base = createDefaultAIWorkflowNodeConfig(
    typeof raw.nodeKey === "string" ? raw.nodeKey : fallbackNodeKey,
  );
  const knowledge = raw.knowledge && typeof raw.knowledge === "object"
    ? { ...base.knowledge, ...(raw.knowledge as Record<string, unknown>) }
    : base.knowledge;
  const policies = raw.policies && typeof raw.policies === "object"
    ? { ...base.policies, ...(raw.policies as Record<string, unknown>) }
    : base.policies;

  return {
    ...base,
    ...raw,
    nodeKey: typeof raw.nodeKey === "string" ? raw.nodeKey : base.nodeKey,
    outputMode: (typeof raw.outputMode === "string" ? raw.outputMode : base.outputMode) as AIWorkflowNodeConfig["outputMode"],
    knowledge: knowledge as AIWorkflowKnowledgeConfig,
    policies: policies as AIWorkflowPolicyConfig,
  };
}

export function isAIWorkflowEngineConfig(config: Record<string, unknown>): boolean {
  return config.action === "ai_workflow" || typeof config.aiNodeKey === "string";
}

export function toAIWorkflowEngineConfig(config: AIWorkflowNodeConfig): Record<string, unknown> {
  return {
    action: "ai_workflow",
    aiNodeKey: config.nodeKey,
    aiNodeVersion: config.nodeVersion ?? "1.0.0",
    aiConfig: config,
  };
}

export function fromAIWorkflowEngineConfig(
  config: Record<string, unknown>,
): AIWorkflowNodeConfig | null {
  if (!isAIWorkflowEngineConfig(config)) return null;
  const embedded = config.aiConfig;
  if (embedded && typeof embedded === "object") {
    return normalizeAIWorkflowNodeConfig(embedded as Record<string, unknown>);
  }
  const nodeKey = typeof config.aiNodeKey === "string" ? config.aiNodeKey : "custom";
  return normalizeAIWorkflowNodeConfig({ nodeKey, ...config });
}
