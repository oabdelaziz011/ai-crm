import type { AiEmployeeStatus } from "./ai-employee-types";

export type AiEmployeeRetrievalPriority = "balanced" | "precision" | "recall";

export type AiEmployeeRetrievalPolicy = {
  topK: number;
  minScore: number;
  priority: AiEmployeeRetrievalPriority;
};

export type AiEmployeeRuntimeFlags = {
  streaming: boolean;
  memoryMode: "session" | "workflow" | "none";
  confirmationPolicy: "never" | "destructive" | "external" | "financial" | "bulk" | "always";
  recoveryEnabled: boolean;
  checkpointEnabled: boolean;
};

export type AiEmployeeRuntimeConfigurationStored = {
  executionTimeoutMs: number;
  retryCount: number;
  rateLimitPerMinute: number;
  maxConcurrency: number;
  disabledToolKeys: string[];
  runtimeFlags: AiEmployeeRuntimeFlags;
  retrievalPolicy: AiEmployeeRetrievalPolicy;
};

export type AiEmployeeRuntimeConfiguration = {
  executionTimeoutMs: number;
  retryCount: number;
  rateLimitPerMinute: number;
  maxConcurrency: number;
  disabledToolKeys: string[];
  runtimeFlags: AiEmployeeRuntimeFlags;
  retrievalPolicy: AiEmployeeRetrievalPolicy;
};

export type AgentRuntimeConfiguration = {
  employeeId: string;
  employeeStatus: AiEmployeeStatus;
  ready: boolean;
  missing: string[];
  validationIssues: AiEmployeeConfigValidationIssue[];
  provider: AgentRuntimeProviderConfig;
  model: AgentRuntimeModelConfig;
  prompt: AgentRuntimePromptConfig;
  knowledge: AgentRuntimeKnowledgeConfig;
  tools: AgentRuntimeToolsConfig;
  limits: AgentRuntimeLimitsConfig;
  runtimeFlags: AiEmployeeRuntimeFlags;
  runtimeInfo: AgentRuntimeInfoSnapshot;
  channelRuntime: AgentRuntimeChannelBinding | null;
};

export type AgentRuntimeProviderConfig = {
  providerKey: string | null;
  providerConnectionId: string | null;
  connectionName: string | null;
  apiStatus: "configured" | "missing" | "placeholder";
  capabilities: string[];
  contextWindow: number | null;
  availableModels: string[];
};

export type AgentRuntimeModelConfig = {
  model: string | null;
  contextWindow: number | null;
  reasoning: boolean;
  vision: boolean;
  functionCalling: boolean;
  streaming: boolean;
  maxOutputTokens: number | null;
};

export type AgentRuntimePromptConfig = {
  systemPrompt: string;
  summary: string;
  versionLabel: string;
  variables: string[];
  estimatedTokens: number;
};

export type AgentRuntimeKnowledgeConfig = {
  enabled: boolean;
  sourceIds: string[];
  sources: Array<{
    id: string;
    name: string;
    sourceType: string | null;
    documentCount: number;
  }>;
  collectionLabel: string | null;
  retrievalPolicy: AiEmployeeRetrievalPolicy;
  documentsSummary: string;
};

export type AgentRuntimeToolsConfig = {
  allowedKeys: string[];
  enabledKeys: string[];
  disabledKeys: string[];
  entries: Array<{
    key: string;
    displayName: string;
    category: string;
    enabled: boolean;
    permissionSummary: string;
    riskLevel: "low" | "medium" | "high" | "critical";
    classification: string;
  }>;
};

export type AgentRuntimeLimitsConfig = {
  temperature: number | null;
  maxTokens: number | null;
  executionTimeoutMs: number;
  retryCount: number;
  rateLimitPerMinute: number;
  maxConcurrency: number;
};

export type AgentRuntimeInfoSnapshot = {
  currentRuntime: string;
  executionStatus: "idle" | "not_bound" | "inactive";
  coordinator: string;
  memoryMode: string;
  checkpointStatus: string;
  confirmationPolicy: string;
  recoveryEnabled: boolean;
};

export type AgentRuntimeChannelBinding = {
  providerConnectionId: string;
  knowledgeRetrieval: {
    embeddingConnectionId: string;
    vectorStoreConnectionId: string;
    collectionId: string;
    topK?: number;
    minScore?: number;
    sourceIds?: string[];
  } | null;
  executionPolicy: {
    streaming: boolean;
    maxDurationMs: number;
    temperature: number | null;
    maxTokens: number | null;
    retryCount: number;
    rateLimitPerMinute: number;
    maxConcurrency: number;
  };
  pageContext: {
    aiEmployeeId: string;
    aiEmployeeName: string;
    allowedToolKeys: string[];
    systemPrompt: string;
  };
};

export type AiEmployeeConfigValidationIssue = {
  field: string;
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type AiEmployeeRuntimeAdapterInput = {
  employee: {
    id: string;
    name: string;
    displayName: string;
    status: AiEmployeeStatus;
    provider: string | null;
    model: string | null;
    temperature: number | null;
    maxTokens: number | null;
    systemPrompt: string;
    systemPromptSummary: string;
    knowledgeSourceIds: string[];
    allowedToolKeys: string[];
    promptVersionLabel: string;
    runtimeConfiguration: AiEmployeeRuntimeConfiguration;
  };
  tenantRuntime: {
    providerConnectionId: string | null;
    providerConnectionName: string | null;
    providerRegistryKey: string | null;
    knowledgeRetrieval: {
      embeddingConnectionId: string;
      vectorStoreConnectionId: string;
      collectionId: string;
      collectionName: string | null;
    } | null;
    missing: string[];
  };
  knowledgeSources: Array<{
    id: string;
    name: string;
    sourceType: string | null;
    documentCount: number;
  }>;
  toolCatalog: Array<{
    key: string;
    displayName: string;
    category: string;
    classification: string;
    requiredPermissions: string[];
    riskLevel: "low" | "medium" | "high" | "critical";
  }>;
  availableModels: string[];
};

export const DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION: AiEmployeeRuntimeConfigurationStored = {
  executionTimeoutMs: 120_000,
  retryCount: 2,
  rateLimitPerMinute: 60,
  maxConcurrency: 1,
  disabledToolKeys: [],
  runtimeFlags: {
    streaming: true,
    memoryMode: "session",
    confirmationPolicy: "destructive",
    recoveryEnabled: true,
    checkpointEnabled: true,
  },
  retrievalPolicy: {
    topK: 5,
    minScore: 0.7,
    priority: "balanced",
  },
};
