import type {
  AiEmployeeConfigValidationIssue,
  AiEmployeeRuntimeAdapterInput,
  AiEmployeeRuntimeConfiguration,
} from "./ai-employee-runtime-types";

export function validateAiEmployeeRuntimeConfiguration(input: {
  employeeStatus: string;
  provider: string | null;
  model: string | null;
  systemPrompt: string;
  knowledgeSourceIds: string[];
  allowedToolKeys: string[];
  disabledToolKeys: string[];
  temperature: number | null;
  maxTokens: number | null;
  runtimeConfiguration: AiEmployeeRuntimeConfiguration;
  tenantMissing: string[];
  providerConnectionMatches: boolean;
  knownToolKeys: Set<string>;
  knownKnowledgeSourceIds: Set<string>;
}): AiEmployeeConfigValidationIssue[] {
  const issues: AiEmployeeConfigValidationIssue[] = [];

  if (input.employeeStatus !== "published") {
    issues.push({
      field: "status",
      code: "employee_not_published",
      message: "Employee must be published for runtime binding",
      severity: "warning",
    });
  }

  if (!input.provider?.trim()) {
    issues.push({
      field: "provider",
      code: "provider_missing",
      message: "Provider is required",
      severity: "error",
    });
  } else if (!input.providerConnectionMatches) {
    issues.push({
      field: "provider",
      code: "provider_connection_missing",
      message: "No enabled tenant provider connection matches this employee provider",
      severity: "error",
    });
  }

  if (!input.model?.trim()) {
    issues.push({
      field: "model",
      code: "model_missing",
      message: "Model is required",
      severity: "error",
    });
  }

  if (!input.systemPrompt.trim()) {
    issues.push({
      field: "prompt",
      code: "prompt_missing",
      message: "System prompt is required",
      severity: "error",
    });
  } else if (input.systemPrompt.trim().length < 16) {
    issues.push({
      field: "prompt",
      code: "prompt_short",
      message: "System prompt is very short",
      severity: "warning",
    });
  }

  if (input.temperature != null && (input.temperature < 0 || input.temperature > 2)) {
    issues.push({
      field: "limits.temperature",
      code: "temperature_out_of_range",
      message: "Temperature must be between 0 and 2",
      severity: "error",
    });
  }

  if (input.maxTokens != null && input.maxTokens <= 0) {
    issues.push({
      field: "limits.maxTokens",
      code: "max_tokens_invalid",
      message: "Max tokens must be greater than zero",
      severity: "error",
    });
  }

  if (input.runtimeConfiguration.executionTimeoutMs <= 0) {
    issues.push({
      field: "limits.executionTimeoutMs",
      code: "timeout_invalid",
      message: "Execution timeout must be greater than zero",
      severity: "error",
    });
  }

  if (input.runtimeConfiguration.retryCount < 0) {
    issues.push({
      field: "limits.retryCount",
      code: "retry_invalid",
      message: "Retry count cannot be negative",
      severity: "error",
    });
  }

  if (input.runtimeConfiguration.sessionTimeoutMinutes <= 0) {
    issues.push({
      field: "limits.sessionTimeoutMinutes",
      code: "session_timeout_invalid",
      message: "Session timeout must be greater than zero minutes",
      severity: "error",
    });
  } else if (input.runtimeConfiguration.sessionTimeoutMinutes > 10_080) {
    issues.push({
      field: "limits.sessionTimeoutMinutes",
      code: "session_timeout_too_large",
      message: "Session timeout cannot exceed 10080 minutes (7 days)",
      severity: "error",
    });
  }

  if (input.knowledgeSourceIds.length > 0) {
    for (const sourceId of input.knowledgeSourceIds) {
      if (!input.knownKnowledgeSourceIds.has(sourceId)) {
        issues.push({
          field: "knowledge",
          code: "unknown_knowledge_source",
          message: `Unknown knowledge source: ${sourceId}`,
          severity: "error",
        });
      }
    }
    if (
      input.tenantMissing.includes("embedding") ||
      input.tenantMissing.includes("vector_store") ||
      input.tenantMissing.includes("collection")
    ) {
      issues.push({
        field: "knowledge",
        code: "tenant_knowledge_incomplete",
        message:
          "Semantic embeddings are not configured — keyword knowledge search will be used until vector retrieval is set up",
        severity: "warning",
      });
    }
  }

  for (const toolKey of input.allowedToolKeys) {
    if (!input.knownToolKeys.has(toolKey)) {
      issues.push({
        field: "tools",
        code: "unknown_tool",
        message: `Unknown tool: ${toolKey}`,
        // Warning only — a single unseeded catalog row must not block channel binding
        // (otherwise WhatsApp falls back to a different employee without booking/transfer).
        severity: "warning",
      });
    }
  }

  for (const disabledKey of input.disabledToolKeys) {
    if (!input.allowedToolKeys.includes(disabledKey)) {
      issues.push({
        field: "tools",
        code: "disabled_tool_not_allowed",
        message: `Disabled tool is not in allowed list: ${disabledKey}`,
        severity: "warning",
      });
    }
  }

  if (input.allowedToolKeys.length === 0) {
    issues.push({
      field: "tools",
      code: "no_tools",
      message: "No tools assigned to this employee",
      severity: "warning",
    });
  }

  return issues;
}

export function isAgentRuntimeConfigurationReady(issues: AiEmployeeConfigValidationIssue[]): boolean {
  return !issues.some((issue) => issue.severity === "error");
}

export function collectRuntimeMissing(input: AiEmployeeRuntimeAdapterInput): string[] {
  // Embedding / vector / collection gaps are non-blocking: knowledge can fall back to keyword search.
  const softMissing = new Set(["embedding", "vector_store", "collection", "knowledge_binding"]);
  const missing = input.tenantRuntime.missing.filter((item) => !softMissing.has(item));
  if (!input.employee.provider) missing.push("employee_provider");
  if (!input.employee.model) missing.push("employee_model");
  if (!input.tenantRuntime.providerConnectionId) missing.push("provider_connection");
  return [...new Set(missing)];
}
