import type { AgentRuntimeConfiguration, AiEmployeeRuntimeAdapterInput } from "./ai-employee-runtime-types";
import {
  collectRuntimeMissing,
  isAgentRuntimeConfigurationReady,
  validateAiEmployeeRuntimeConfiguration,
} from "./ai-employee-config-validator";
import {
  estimatePromptTokens,
  extractPromptVariables,
  resolveModelCapabilities,
  resolveProviderCapabilities,
} from "./model-capabilities-catalog";
import { summarizeToolPermissions } from "./tool-metadata-adapter";
import {
  buildTicketToolPromptHint,
  isTicketToolKey,
  resolveTicketToolKeysForEmployee,
} from "@/lib/ai-employees/utilities/ticket-tool-scope";

export function buildAgentRuntimeConfiguration(
  input: AiEmployeeRuntimeAdapterInput,
): AgentRuntimeConfiguration {
  const { employee, tenantRuntime, knowledgeSources, toolCatalog } = input;
  const providerMeta = resolveProviderCapabilities(employee.provider);
  const modelMeta = resolveModelCapabilities(employee.model);
  const providerConnectionMatches = Boolean(
    employee.provider &&
      tenantRuntime.providerRegistryKey &&
      tenantRuntime.providerRegistryKey === employee.provider &&
      tenantRuntime.providerConnectionId,
  );

  const allowedKeys = resolveTicketToolKeysForEmployee({
    tags: "tags" in employee && Array.isArray(employee.tags) ? employee.tags : [],
    allowedToolKeys: employee.allowedToolKeys,
  });
  const disabledKeys = employee.runtimeConfiguration.disabledToolKeys;
  const transferableFlowId = employee.runtimeConfiguration.transferableFlowId ?? null;
  let enabledKeys = allowedKeys.filter((key) => !disabledKeys.includes(key));
  // Drop catalog-missing tools so runtime scope stays valid without failing the whole employee.
  const knownToolKeySet = new Set(toolCatalog.map((tool) => tool.key));
  enabledKeys = enabledKeys.filter((key) => knownToolKeySet.has(key) || key === "transfer_to_workflow");
  if (transferableFlowId && !enabledKeys.includes("transfer_to_workflow")) {
    enabledKeys = [...enabledKeys, "transfer_to_workflow"];
  }
  const hasSchedulingTools = enabledKeys.some((key) =>
    [
      "create_booking",
      "search_availability",
      "find_next_available",
      "recommend_appointment",
      "reschedule_booking",
      "cancel_booking",
    ].includes(key),
  );
  const enabledTicketTools = enabledKeys.filter(isTicketToolKey);
  const ticketToolPromptHint = buildTicketToolPromptHint(enabledTicketTools);
  const bookingActionPromptAddon = hasSchedulingTools
    ? [
        "CRITICAL BOOKING ACTION RULES:",
        "- You may only confirm a booking after create_booking returns success=true with a bookingId.",
        "- Before offering times, call search_availability or find_next_available.",
        "- If a tool returns success=false, booking_conflict, or slot_unavailable: tell the customer the slot is already booked/unavailable and offer another slot. Never invent availability.",
        "- Never say تم الحجز / booked / confirmed unless a tool actually succeeded.",
      ].join("\n")
    : "";
  const transferPromptAddon = transferableFlowId
    ? [
        "CRITICAL WORKFLOW TRANSFER RULES:",
        `- This employee is linked to automation flow ${transferableFlowId}.`,
        "- For multi-step booking lists (doctor/date/time pickers), call transfer_to_workflow immediately.",
        "- You may still use real booking tools for direct availability checks or create_booking when the customer already gave exact details.",
        "- After transfer_to_workflow succeeds, reply using customerFacingMessage from the tool result.",
        "- Never invent a booking confirmation without a successful tool result.",
      ].join("\n")
    : "";
  const channelSystemPrompt = [employee.systemPrompt.trim(), bookingActionPromptAddon, transferPromptAddon]
    .filter(Boolean)
    .join("\n\n");

  const toolEntries = toolCatalog
    .filter((tool) => allowedKeys.includes(tool.key))
    .map((tool) => ({
      key: tool.key,
      displayName: tool.displayName,
      category: tool.category,
      enabled: !disabledKeys.includes(tool.key),
      permissionSummary: summarizeToolPermissions(tool.requiredPermissions),
      riskLevel: tool.riskLevel,
      classification: tool.classification,
    }));

  const selectedKnowledge = knowledgeSources.filter((source) =>
    employee.knowledgeSourceIds.includes(source.id),
  );
  const documentsTotal = selectedKnowledge.reduce((sum, source) => sum + source.documentCount, 0);

  const validationIssues = validateAiEmployeeRuntimeConfiguration({
    employeeStatus: employee.status,
    provider: employee.provider,
    model: employee.model,
    systemPrompt: employee.systemPrompt,
    knowledgeSourceIds: employee.knowledgeSourceIds,
    allowedToolKeys: allowedKeys,
    disabledToolKeys: disabledKeys,
    temperature: employee.temperature,
    maxTokens: employee.maxTokens,
    runtimeConfiguration: employee.runtimeConfiguration,
    tenantMissing: tenantRuntime.missing,
    providerConnectionMatches,
    knownToolKeys: new Set(toolCatalog.map((tool) => tool.key)),
    knownKnowledgeSourceIds: new Set(knowledgeSources.map((source) => source.id)),
  });

  const missing = collectRuntimeMissing(input);
  const ready = isAgentRuntimeConfigurationReady(validationIssues) && missing.length === 0;

  const channelRuntime =
    tenantRuntime.providerConnectionId && providerConnectionMatches
      ? {
          providerConnectionId: tenantRuntime.providerConnectionId,
          knowledgeRetrieval: tenantRuntime.knowledgeRetrieval
            ? {
                ...tenantRuntime.knowledgeRetrieval,
                // Channel replies need fewer chunks for lower latency.
                topK: Math.min(employee.runtimeConfiguration.retrievalPolicy.topK || 3, 3),
                minScore: employee.runtimeConfiguration.retrievalPolicy.minScore,
                sourceIds: employee.knowledgeSourceIds,
              }
            : null,
          executionPolicy: {
            streaming: employee.runtimeConfiguration.runtimeFlags.streaming,
            maxDurationMs: employee.runtimeConfiguration.executionTimeoutMs,
            temperature: employee.temperature,
            maxTokens: employee.maxTokens,
            retryCount: employee.runtimeConfiguration.retryCount,
            rateLimitPerMinute: employee.runtimeConfiguration.rateLimitPerMinute,
            maxConcurrency: employee.runtimeConfiguration.maxConcurrency,
          },
          pageContext: {
            aiEmployeeId: employee.id,
            aiEmployeeName: employee.displayName,
            allowedToolKeys: enabledKeys,
            systemPrompt: channelSystemPrompt,
            transferableFlowId,
            ...(ticketToolPromptHint ? { ticketToolPromptHint } : {}),
          },
        }
      : null;

  return {
    employeeId: employee.id,
    employeeStatus: employee.status,
    ready,
    missing,
    validationIssues,
    provider: {
      providerKey: employee.provider,
      providerConnectionId: tenantRuntime.providerConnectionId,
      connectionName: tenantRuntime.providerConnectionName,
      apiStatus: tenantRuntime.providerConnectionId ? "configured" : "missing",
      capabilities: providerMeta.capabilities,
      contextWindow: providerMeta.contextWindow,
      availableModels: input.availableModels.length > 0 ? input.availableModels : providerMeta.models,
    },
    model: modelMeta,
    prompt: {
      systemPrompt: employee.systemPrompt,
      summary: employee.systemPromptSummary,
      versionLabel: employee.promptVersionLabel,
      variables: extractPromptVariables(employee.systemPrompt),
      estimatedTokens: estimatePromptTokens(employee.systemPrompt),
    },
    knowledge: {
      enabled: employee.knowledgeSourceIds.length > 0,
      sourceIds: employee.knowledgeSourceIds,
      sources: selectedKnowledge,
      collectionLabel: tenantRuntime.knowledgeRetrieval?.collectionName ?? null,
      retrievalPolicy: employee.runtimeConfiguration.retrievalPolicy,
      documentsSummary:
        selectedKnowledge.length === 0
          ? "No knowledge sources assigned"
          : `${selectedKnowledge.length} sources · ${documentsTotal} documents`,
    },
    tools: {
      allowedKeys,
      enabledKeys,
      disabledKeys,
      entries: toolEntries,
    },
    limits: {
      temperature: employee.temperature,
      maxTokens: employee.maxTokens,
      executionTimeoutMs: employee.runtimeConfiguration.executionTimeoutMs,
      retryCount: employee.runtimeConfiguration.retryCount,
      rateLimitPerMinute: employee.runtimeConfiguration.rateLimitPerMinute,
      maxConcurrency: employee.runtimeConfiguration.maxConcurrency,
    },
    runtimeFlags: employee.runtimeConfiguration.runtimeFlags,
    runtimeInfo: {
      currentRuntime: "Agent Runtime",
      executionStatus: employee.status === "published" && ready ? "idle" : employee.status === "published" ? "not_bound" : "inactive",
      coordinator: "Runtime Coordinator",
      memoryMode: employee.runtimeConfiguration.runtimeFlags.memoryMode,
      checkpointStatus: employee.runtimeConfiguration.runtimeFlags.checkpointEnabled ? "enabled" : "disabled",
      confirmationPolicy: employee.runtimeConfiguration.runtimeFlags.confirmationPolicy,
      recoveryEnabled: employee.runtimeConfiguration.runtimeFlags.recoveryEnabled,
    },
    channelRuntime,
  };
}
