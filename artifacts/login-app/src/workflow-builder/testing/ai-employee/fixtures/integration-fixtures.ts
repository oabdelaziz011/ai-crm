import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "../../../../lib/ai-employees/adapters/ai-employee-runtime-types";
import type { AgentRuntimeChannelBinding } from "../../../../lib/ai-employees/adapters/ai-employee-runtime-types";
import type { AiEmployeeRecord } from "../../../../lib/ai-employees/types/ai-employee-types";

export const INTEGRATION_COMPANY_ID = "company-integration-1";
export const INTEGRATION_FLOW_ID = "flow-integration-ai-employee";
export const TENANT_PROVIDER_CONNECTION_ID = "tenant-provider-default";
export const EMPLOYEE_PROVIDER_CONNECTION_ID = "employee-provider-dedicated";

export function createIntegrationEmployee(
  overrides: Partial<AiEmployeeRecord> = {},
): AiEmployeeRecord {
  return {
    id: "employee-a",
    name: "employee-a",
    displayName: "Employee A",
    description: "Integration test employee",
    avatar: null,
    department: "Support",
    ownerId: "user-integration-1",
    owner: "Integration Owner",
    status: "published",
    provider: "openai",
    model: "gpt-4.1",
    temperature: 0.4,
    maxTokens: 2048,
    systemPrompt: "You are Employee A.",
    systemPromptSummary: "You are Employee A.",
    welcomeMessage: "",
    knowledgeSourceIds: ["kb-integration-1"],
    knowledgeSummary: "1 knowledge source",
    allowedToolKeys: ["search_customer", "knowledge_search"],
    toolSummary: "search_customer, knowledge_search",
    allowedSkillIds: [],
    skillsSummary: "No skills assigned",
    tags: ["integration"],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    promptVersionLabel: "v1",
    runtimeConfiguration: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
    publishedVersionId: "version-integration-1",
    currentVersionNumber: 1,
    hasUnpublishedDraft: false,
    ...overrides,
  };
}

export function createIntegrationEmployeeB(): AiEmployeeRecord {
  return createIntegrationEmployee({
    id: "employee-b",
    name: "employee-b",
    displayName: "Employee B",
    allowedToolKeys: ["knowledge_search"],
    toolSummary: "knowledge_search",
    systemPrompt: "You are Employee B.",
    systemPromptSummary: "You are Employee B.",
  });
}

export function createIntegrationChannelRuntime(
  employee: AiEmployeeRecord,
  overrides: Partial<AgentRuntimeChannelBinding> = {},
): AgentRuntimeChannelBinding {
  return {
    providerConnectionId: EMPLOYEE_PROVIDER_CONNECTION_ID,
    knowledgeRetrieval: {
      embeddingConnectionId: "embed-integration-1",
      vectorStoreConnectionId: "vector-integration-1",
      collectionId: "collection-integration-1",
      topK: 5,
      minScore: 0.7,
      sourceIds: employee.knowledgeSourceIds,
    },
    executionPolicy: {
      streaming: false,
      maxDurationMs: 120_000,
      temperature: employee.temperature,
      maxTokens: employee.maxTokens,
      retryCount: 1,
      rateLimitPerMinute: 60,
      maxConcurrency: 1,
    },
    pageContext: {
      aiEmployeeId: employee.id,
      aiEmployeeName: employee.displayName,
      allowedToolKeys: employee.allowedToolKeys,
      systemPrompt: employee.systemPrompt,
    },
    ...overrides,
  };
}
