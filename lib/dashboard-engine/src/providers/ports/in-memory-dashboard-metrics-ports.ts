import type {
  AiMetricsData,
  AutomationMetricsData,
  ChannelsMetricsData,
  CrmMetricsData,
  DashboardMetricsPorts,
  KnowledgeMetricsData,
  SupportMetricsData,
} from "./dashboard-metrics-ports.js";

export type InMemoryDashboardMetricsSeed = {
  crm?: Partial<Record<string, CrmMetricsData>>;
  support?: Partial<Record<string, SupportMetricsData>>;
  ai?: Partial<Record<string, AiMetricsData>>;
  automation?: Partial<Record<string, AutomationMetricsData>>;
  knowledge?: Partial<Record<string, KnowledgeMetricsData>>;
  channels?: Partial<Record<string, ChannelsMetricsData>>;
};

const EMPTY_CRM: CrmMetricsData = {
  totalCustomers: 0,
  activeCustomers: 0,
  newCustomers: 0,
  leads: 0,
  deals: 0,
  pipelineValue: 0,
};

const EMPTY_SUPPORT: SupportMetricsData = {
  openTickets: 0,
  closedToday: 0,
  slaCompliancePercent: 0,
  averageResponseMinutes: 0,
  averageResolutionMinutes: 0,
};

const EMPTY_AI: AiMetricsData = {
  conversations: 0,
  successRatePercent: 0,
  toolCalls: 0,
  escalations: 0,
  estimatedHoursSaved: 0,
};

const EMPTY_AUTOMATION: AutomationMetricsData = {
  workflowRuns: 0,
  successCount: 0,
  failureCount: 0,
  runningCount: 0,
  averageRuntimeMs: 0,
};

const EMPTY_KNOWLEDGE: KnowledgeMetricsData = {
  searches: 0,
  retrievalSuccessRatePercent: 0,
  retrievedDocuments: 0,
  averageRetrievalTimeMs: 0,
};

const EMPTY_CHANNELS: ChannelsMetricsData = {
  whatsappMessages: 0,
  emailMessages: 0,
  messengerMessages: 0,
  instagramMessages: 0,
  failedDeliveries: 0,
};

function createPort<T>(
  seed: Partial<Record<string, T>> | undefined,
  fallback: T,
): { fetchMetrics(companyId: string): Promise<T> } {
  return {
    async fetchMetrics(companyId: string): Promise<T> {
      return seed?.[companyId] ?? fallback;
    },
  };
}

export function createInMemoryDashboardMetricsPorts(
  seed: InMemoryDashboardMetricsSeed = {},
): DashboardMetricsPorts {
  return {
    crm: createPort(seed.crm, EMPTY_CRM),
    support: createPort(seed.support, EMPTY_SUPPORT),
    ai: createPort(seed.ai, EMPTY_AI),
    automation: createPort(seed.automation, EMPTY_AUTOMATION),
    knowledge: createPort(seed.knowledge, EMPTY_KNOWLEDGE),
    channels: createPort(seed.channels, EMPTY_CHANNELS),
  };
}

export const demoDashboardMetricsSeed: InMemoryDashboardMetricsSeed = {
  crm: {
    "company-1": {
      totalCustomers: 120,
      activeCustomers: 84,
      newCustomers: 12,
      leads: 18,
      deals: 9,
      pipelineValue: 245000,
    },
  },
  support: {
    "company-1": {
      openTickets: 14,
      closedToday: 6,
      slaCompliancePercent: 92.5,
      averageResponseMinutes: 8.4,
      averageResolutionMinutes: 42.1,
    },
  },
  ai: {
    "company-1": {
      conversations: 320,
      successRatePercent: 87.2,
      toolCalls: 540,
      escalations: 11,
      estimatedHoursSaved: 48.5,
    },
  },
  automation: {
    "company-1": {
      workflowRuns: 210,
      successCount: 198,
      failureCount: 7,
      runningCount: 5,
      averageRuntimeMs: 1240,
    },
  },
  knowledge: {
    "company-1": {
      searches: 890,
      retrievalSuccessRatePercent: 94.1,
      retrievedDocuments: 4120,
      averageRetrievalTimeMs: 186,
    },
  },
  channels: {
    "company-1": {
      whatsappMessages: 1540,
      emailMessages: 620,
      messengerMessages: 410,
      instagramMessages: 95,
      failedDeliveries: 17,
    },
  },
};
