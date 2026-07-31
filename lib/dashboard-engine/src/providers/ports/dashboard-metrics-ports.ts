export type CrmMetricsData = {
  totalCustomers: number;
  activeCustomers: number;
  newCustomers: number;
  leads: number;
  deals: number;
  pipelineValue: number;
};

export type SupportMetricsData = {
  openTickets: number;
  closedToday: number;
  slaCompliancePercent: number;
  averageResponseMinutes: number;
  averageResolutionMinutes: number;
};

export type AiMetricsData = {
  conversations: number;
  successRatePercent: number;
  toolCalls: number;
  escalations: number;
  estimatedHoursSaved: number;
};

export type AutomationMetricsData = {
  workflowRuns: number;
  successCount: number;
  failureCount: number;
  runningCount: number;
  averageRuntimeMs: number;
};

export type KnowledgeMetricsData = {
  searches: number;
  retrievalSuccessRatePercent: number;
  retrievedDocuments: number;
  averageRetrievalTimeMs: number;
};

export type ChannelsMetricsData = {
  whatsappMessages: number;
  emailMessages: number;
  messengerMessages: number;
  instagramMessages: number;
  failedDeliveries: number;
};

export type CrmMetricsPort = {
  fetchMetrics(companyId: string): Promise<CrmMetricsData>;
};

export type SupportMetricsPort = {
  fetchMetrics(companyId: string): Promise<SupportMetricsData>;
};

export type AiMetricsPort = {
  fetchMetrics(companyId: string): Promise<AiMetricsData>;
};

export type AutomationMetricsPort = {
  fetchMetrics(companyId: string): Promise<AutomationMetricsData>;
};

export type KnowledgeMetricsPort = {
  fetchMetrics(companyId: string): Promise<KnowledgeMetricsData>;
};

export type ChannelsMetricsPort = {
  fetchMetrics(companyId: string): Promise<ChannelsMetricsData>;
};

export type DashboardMetricsPorts = {
  crm: CrmMetricsPort;
  support: SupportMetricsPort;
  ai: AiMetricsPort;
  automation: AutomationMetricsPort;
  knowledge: KnowledgeMetricsPort;
  channels: ChannelsMetricsPort;
};

export const CRM_METRICS_PROVIDER_ID = "crm";
export const SUPPORT_METRICS_PROVIDER_ID = "support";
export const AI_METRICS_PROVIDER_ID = "ai";
export const AUTOMATION_METRICS_PROVIDER_ID = "automation";
export const KNOWLEDGE_METRICS_PROVIDER_ID = "knowledge";
export const CHANNELS_METRICS_PROVIDER_ID = "channels";

export const CRM_VIEW_PERMISSION = "customers.view";
export const SUPPORT_VIEW_PERMISSION = "ai.conversations.view";
export const AI_VIEW_PERMISSION = "ai.analytics.view";
export const AUTOMATION_VIEW_PERMISSION = "automation.view";
export const KNOWLEDGE_VIEW_PERMISSION = "knowledge.view";
export const CHANNELS_VIEW_PERMISSION = "channels.view";
