import type { AgentRuntimeConfiguration } from "@/lib/ai-employees/adapters";
import type {
  AiEmployeeReadinessScore,
  AiEmployeeValidationCategory,
  AiEmployeeValidationResult,
} from "@/lib/ai-employees/types";

const CATEGORY_BY_FIELD: Record<string, AiEmployeeValidationCategory> = {
  status: "runtime",
  provider: "provider",
  model: "model",
  prompt: "prompt",
  knowledge: "knowledge",
  tools: "tools",
  permissions: "permissions",
};

/** Categories that must be ready before publish (knowledge vectors / tools are optional). */
const PUBLISH_CRITICAL_CATEGORIES = new Set([
  "prompt",
  "provider",
  "model",
  "permissions",
  "limits",
]);

function resolveCategory(field: string): AiEmployeeValidationCategory {
  if (field.startsWith("limits.")) return "limits";
  return CATEGORY_BY_FIELD[field] ?? "runtime";
}

export function buildValidationResult(preview: AgentRuntimeConfiguration | null): AiEmployeeValidationResult {
  const issues = (preview?.validationIssues ?? []).map((issue) => ({
    field: issue.field,
    code: issue.code,
    message: issue.message,
    severity: issue.severity,
    category: resolveCategory(issue.field),
  }));

  return {
    ready: preview?.ready ?? false,
    issues,
  };
}

export function buildReadinessScore(preview: AgentRuntimeConfiguration | null): AiEmployeeReadinessScore {
  const hasPrompt = Boolean(preview?.prompt.systemPrompt.trim());
  const hasProvider = Boolean(preview?.provider.providerConnectionId);
  const hasModel = Boolean(preview?.model.model);
  const hasRuntime = Boolean(preview?.channelRuntime) || hasProvider;
  const knowledgeEnabled = Boolean(preview?.knowledge.enabled);
  const hasKnowledgeSources = (preview?.knowledge.sourceIds.length ?? 0) > 0;
  const hasTools = (preview?.tools.enabledKeys.length ?? 0) > 0;
  const permissionsOk = !issuesIncludeCategory(preview, "permissions");
  const limitsOk = !issuesIncludeCategory(preview, "limits");

  const categories: AiEmployeeReadinessScore["categories"] = [
    {
      id: "prompt",
      label: "prompt",
      ready: hasPrompt,
      missing: hasPrompt ? [] : ["prompt_required"],
    },
    {
      id: "provider",
      label: "provider",
      ready: hasProvider,
      missing: hasProvider ? [] : ["provider_connection_required"],
    },
    {
      id: "model",
      label: "model",
      ready: hasModel,
      missing: hasModel ? [] : ["model_required"],
    },
    {
      id: "runtime",
      label: "runtime",
      ready: hasRuntime,
      missing: hasRuntime ? [] : ["runtime_binding_incomplete"],
    },
    {
      id: "knowledge",
      // Assigned sources are enough; vector collection is optional (keyword fallback).
      ready: !knowledgeEnabled || hasKnowledgeSources,
      missing:
        knowledgeEnabled && !hasKnowledgeSources
          ? ["knowledge_sources_required"]
          : knowledgeEnabled && !preview?.knowledge.collectionLabel
            ? ["knowledge_keyword_fallback"]
            : [],
    },
    {
      id: "tools",
      // Chat-only employees are allowed to publish without tools.
      ready: true,
      missing: hasTools ? [] : ["tools_optional_empty"],
    },
    {
      id: "permissions",
      label: "permissions",
      ready: permissionsOk,
      missing: collectIssueMessages(preview, "permissions"),
    },
    {
      id: "limits",
      label: "limits",
      ready: limitsOk,
      missing: collectIssueMessages(preview, "limits"),
    },
  ];

  const readyCount = categories.filter((category) => category.ready).length;
  const score = Math.round((readyCount / categories.length) * 100);
  const criticalReady = categories
    .filter((category) => PUBLISH_CRITICAL_CATEGORIES.has(category.id))
    .every((category) => category.ready);
  const hasErrors = (preview?.validationIssues ?? []).some((issue) => issue.severity === "error");

  return {
    score,
    ready: criticalReady && !hasErrors,
    categories,
  };
}

function issuesIncludeCategory(
  preview: AgentRuntimeConfiguration | null,
  category: AiEmployeeValidationCategory,
): boolean {
  return (preview?.validationIssues ?? []).some(
    (issue) => issue.severity === "error" && resolveCategory(issue.field) === category,
  );
}

function collectIssueMessages(
  preview: AgentRuntimeConfiguration | null,
  category: AiEmployeeValidationCategory,
): string[] {
  return (preview?.validationIssues ?? [])
    .filter((issue) => issue.severity === "error" && resolveCategory(issue.field) === category)
    .map((issue) => issue.message);
}

export function hasBlockingPublishIssues(result: AiEmployeeValidationResult): boolean {
  return result.issues.some((issue) => issue.severity === "error");
}
