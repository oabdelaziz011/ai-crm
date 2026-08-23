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
  buildWelcomeMessagePromptAddon,
  resolveAiEmployeeWelcomeMessage,
} from "@/lib/ai-employees/utilities/resolve-ai-employee-welcome-message";
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
      "search_bookings",
      "booking_search",
      "reschedule_booking",
      "cancel_booking",
      "check_in",
      "check_out",
    ].includes(key),
  );
  const enabledTicketTools = enabledKeys.filter(isTicketToolKey);
  const ticketToolPromptHint = buildTicketToolPromptHint(enabledTicketTools);
  const bookingActionPromptAddon = hasSchedulingTools
    ? [
        "CRITICAL BOOKING ACTION RULES:",
        "- You may only confirm a booking after create_booking returns success=true with a bookingId.",
        "- Before offering times, call search_availability or find_next_available.",
        "- Use exact serviceId and resourceId UUIDs from the SCHEDULING CATALOG when provided.",
        "- When search_availability returns success=true with availableDates or slots, list concrete dates and times immediately. Never say you are still checking after slots were returned.",
        "- When search_availability returns customerSummary, include those dates/times in your Arabic reply once (you may shorten slightly but must show real options). Do not send the same availability list twice.",
        "- Do not ask the customer to pick a date before showing available options from search_availability.",
        "- After the customer picks a slot, do NOT call search_availability again. Ask once for customer name and mobile number only if this conversation does not already have a trusted CRM customer identity.",
        "- If they already sent name and mobile in this conversation, do not ask again.",
        "- Never send waiting text such as هبدأ / سأقوم الآن بحجز / سيقوم الآن بحجز / إتمام عملية الحجز / لحظة من فضلك. Call create_booking first, then reply with the confirmation.",
        "- If the customer sends ؟؟ or يقول بعتهم بالفعل, continue the pending booking. Do not restart availability.",
        "- Do NOT silently use the WhatsApp sender phone as the booking customer unless a trusted CRM customer is already bound on this conversation. If trustedCustomerId is present, do not ask for name/phone merely to identify them.",
        "- Call search_customer by the mobile they provide. If not found, call create_customer with customer name + that mobile.",
        "- create_customer creates a new CRM profile when the phone is new, or returns the existing CRM profile when the phone already exists (existing CRM name is preserved).",
        "- After you have a real customer UUID from create_customer (preferred) or a matching search_customer hit, call create_booking immediately so the appointment is saved to the company calendar.",
        "- Never invent customerId values such as 1, customer-id, the customer name, or a phone number. Only use a UUID from trustedCustomerId / conversation.customer_id, or returned by search_customer / create_customer. An LLM-invented customerId must never override trusted identity.",
        "- When the customer asks to see bookings/appointments or sends a mobile number to look up bookings: call search_bookings with phone set to that mobile (purpose=list, NOT cancel). Reply using customerFacingMessage. Never stay silent.",
        "- CANCEL FLOW: when the customer wants to cancel (الغاء/ألغي/cancel): ask for the customer mobile if missing, then call search_bookings with purpose=\"cancel\". Show the list and ASK which appointment. Do NOT call cancel_booking until they pick a list number or BK- reference. Never cancel all bookings.",
        "- After they pick a BK- reference or list number, call cancel_booking for that booking only. Reply with the cancel confirmation. Do not restart a new booking intake and do not re-send the full list.",
        "- CHECK-IN / CHECK-OUT: when the customer asks to check in/out (تسجيل حضور/انصراف) with a BK- reference (and phone if needed), call check_in or check_out directly with bookingReference + phone. Do not list bookings or invent status changes.",
        "- Prefer booking_search only when the conversation already has a trusted customer and the user wants a CRM-style booking history without providing a phone.",
        "- If a tool returns success=false, booking_conflict, or slot_unavailable: tell the customer the slot is already booked/unavailable and offer another available time from the last search result. Never invent availability and never say تم الحجز.",
        "- Never say تم الحجز / booked / confirmed unless create_booking returned success=true with a bookingId.",
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
  const resolvedWelcomeMessage = resolveAiEmployeeWelcomeMessage(employee.welcomeMessage);
  const welcomePromptAddon = buildWelcomeMessagePromptAddon(resolvedWelcomeMessage);
  const channelSystemPrompt = [
    employee.systemPrompt.trim(),
    bookingActionPromptAddon,
    transferPromptAddon,
    ticketToolPromptHint,
    welcomePromptAddon,
  ]
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
            welcomeMessage: resolvedWelcomeMessage,
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
      sessionTimeoutMinutes: employee.runtimeConfiguration.sessionTimeoutMinutes,
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
