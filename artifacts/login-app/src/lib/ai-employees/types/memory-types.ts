export type AiEmployeeMemoryEntryType =
  | "variable"
  | "fact"
  | "preference"
  | "tool_output"
  | "checkpoint"
  | "knowledge"
  | "conversation";

export type AiEmployeeMemoryOverview = {
  activeContextLabel: string;
  contextSizeTokens: number;
  storedMemories: number;
  memoryHealth: "healthy" | "degraded" | "empty";
  memoryUsagePercent: number;
};

export type AiEmployeeShortTermMemory = {
  sessionId: string | null;
  activeVariables: Array<{ key: string; value: string }>;
  recentFacts: string[];
  runtimeContext: Record<string, unknown>;
};

export type AiEmployeeLongTermMemoryEntry = {
  id: string;
  type: AiEmployeeMemoryEntryType;
  label: string;
  content: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type AiEmployeeContextWindowSection = {
  key: string;
  label: string;
  tokenEstimate: number;
  included: boolean;
};

export type AiEmployeeContextWindowSnapshot = {
  maxTokens: number;
  estimatedTokens: number;
  sections: AiEmployeeContextWindowSection[];
  conversationHistoryCount: number;
  knowledgeReferenceCount: number;
};

export type AiEmployeeMemoryTimelineEntry = {
  id: string;
  eventType: "created" | "updated" | "retrieved" | "expired";
  label: string;
  source: string;
  timestamp: string;
};

export type AiEmployeeMemorySearchFilters = {
  keyword?: string;
  type?: AiEmployeeMemoryEntryType | "all";
  source?: string | "all";
  fromDate?: string;
  toDate?: string;
};

export type AiEmployeeContextInspectorSnapshot = {
  prompt: string;
  memories: string[];
  knowledgeReferences: string[];
  runtimeVariables: Array<{ key: string; value: string }>;
  toolContext: string[];
};

export type AiEmployeeMemoryPoliciesSnapshot = {
  memoryMode: string;
  retentionPolicy: string;
  expirationPolicy: string;
  privacyRules: string[];
  maxContextSize: number;
};

export type AiEmployeeMemoryAnalyticsSnapshot = {
  memoryHits: number;
  memoryMisses: number;
  retrievalSuccessRate: number;
  averageRetrievalTimeMs: number | null;
  contextGrowthPercent: number;
};

export type AiEmployeeContextDebuggerStep = {
  order: number;
  source: string;
  label: string;
  tokenEstimate: number;
};

export type AiEmployeeContextDebuggerSnapshot = {
  assemblyOrder: AiEmployeeContextDebuggerStep[];
  memorySources: string[];
  knowledgeSources: string[];
  timelineSources: string[];
  finalContextSizeTokens: number;
};

export type AiEmployeeMemorySnapshot = {
  overview: AiEmployeeMemoryOverview;
  shortTerm: AiEmployeeShortTermMemory;
  longTerm: AiEmployeeLongTermMemoryEntry[];
  contextWindow: AiEmployeeContextWindowSnapshot;
  timeline: AiEmployeeMemoryTimelineEntry[];
  inspector: AiEmployeeContextInspectorSnapshot;
  policies: AiEmployeeMemoryPoliciesSnapshot;
  analytics: AiEmployeeMemoryAnalyticsSnapshot;
  debugger: AiEmployeeContextDebuggerSnapshot;
};
