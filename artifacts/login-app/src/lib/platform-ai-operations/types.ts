export type PlatformAiOpsKpis = {
  requestsToday: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  avgTokens: number;
  estimatedCostUsd: number;
  activeCompanies: number;
  backgroundTasks: number;
};

export type PlatformAiOpsProviderHealth = {
  providerKey: string;
  status: "green" | "yellow" | "red" | "unknown";
  latencyMs: number;
  lastError: string | null;
  successRate: number;
  rate429: number;
  rate5xx: number;
  queueDepth: number;
};

export type PlatformAiOpsRequestRow = {
  id: string;
  recorded_at: string;
  company_id: string;
  company_name: string;
  user_id: string | null;
  module: string;
  prompt_type: string;
  conversation_id: string | null;
  tool_calling: boolean;
  knowledge_used: boolean;
  automation_used: boolean;
  model: string;
  provider_key: string;
  total_tokens: number;
  latency_ms: number;
  estimated_cost: number;
  result_status: string;
  correlation_id: string | null;
};

export type PlatformAiOpsToolStat = {
  tool_name: string;
  call_count: number;
  success_count: number;
  failure_count: number;
  avg_duration_ms: number;
  error_rate: number;
};

export type PlatformAiOpsAgentWorkflow = {
  id: string;
  company_id: string;
  company_name: string;
  goal: string;
  status: string;
  progress: number;
  task_count: number;
  correlation_id: string | null;
  agent_type?: string | null;
  tools_used?: string[] | null;
  created_at: string;
  updated_at: string;
};

export type PlatformAiOpsCrmAgentSummary = {
  total_workflows: number;
  crm_workflows: number;
  running: number;
  waiting_user: number;
  completed_24h: number;
  failed_24h: number;
  top_tools: Array<{ tool: string; count: number }>;
};

export type PlatformAiOpsKnowledgeSummary = {
  documents_total: number;
  documents_indexed: number;
  documents_indexing: number;
  chunks_total: number;
  embeddings_active: number;
  jobs_queued: number;
  jobs_running: number;
  jobs_failed: number;
  avg_indexing_latency_ms: number;
};

export type PlatformAiOpsKnowledgeDocument = {
  id: string;
  company_id: string;
  company_name: string;
  title: string;
  status: string;
  mime_type: string;
  chunk_count: number;
  embedding_status: string;
  updated_at: string;
};

export type PlatformAiOpsEmbeddingJobRow = {
  id: string;
  company_id: string;
  company_name: string;
  document_title: string;
  status: string;
  progress_pct: number;
  retry_count: number;
  error_message: string | null;
  provider: string;
  model: string;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type PlatformAiOpsBackgroundTask = {
  id: string;
  company_id: string;
  user_id: string | null;
  label: string;
  task_type: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  retry_count: number;
  error_message: string | null;
  metadata: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
};

export type PlatformAiOpsErrorGroup = {
  error_code: string;
  error_category: string;
  source_layer: string;
  human_message: string;
  first_seen: string;
  last_seen: string;
  occurrences: number;
  affected_companies: number;
  sample_correlation_id: string | null;
  sample_stack: string | null;
};

export type PlatformAiOpsCostTrendPoint = {
  day: string;
  total_tokens: number;
  estimated_cost: number;
  request_count: number;
};

export type PlatformAiOpsCompanyCost = {
  company_id: string;
  company_name: string;
  total_tokens: number;
  estimated_cost: number;
  request_count: number;
};

export type PlatformAiOpsFeatureRow = {
  company_id: string;
  company_name: string;
  ai_chat: boolean;
  tool_calling: boolean;
  knowledge: boolean;
  automation: boolean;
  voice: boolean;
};

export type PlatformAiOpsAuditRow = {
  id: string;
  created_at: string;
  action: string;
  entity: string;
  company_id: string | null;
  user_id: string | null;
  metadata: Record<string, unknown>;
};

export type PlatformAiOpsAlert = {
  id: string;
  alert_type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
  created_at: string;
};
