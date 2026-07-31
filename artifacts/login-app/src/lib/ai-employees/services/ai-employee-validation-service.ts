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
  const categories: AiEmployeeReadinessScore["categories"] = [
    {
      id: "prompt",
      label: "Prompt",
      ready: Boolean(preview?.prompt.systemPrompt.trim()),
      missing: preview?.prompt.systemPrompt.trim() ? [] : ["System prompt required"],
    },
    {
      id: "provider",
      label: "Provider",
      ready: Boolean(preview?.provider.providerConnectionId),
      missing: preview?.provider.providerConnectionId ? [] : ["Provider connection required"],
    },
    {
      id: "model",
      label: "Model",
      ready: Boolean(preview?.model.model),
      missing: preview?.model.model ? [] : ["Model required"],
    },
    {
      id: "runtime",
      label: "Runtime",
      ready: Boolean(preview?.channelRuntime),
      missing: preview?.channelRuntime ? [] : ["Runtime binding incomplete"],
    },
    {
      id: "knowledge",
      label: "Knowledge",
      ready: !preview?.knowledge.enabled || Boolean(preview.knowledge.collectionLabel),
      missing:
        preview?.knowledge.enabled && !preview.knowledge.collectionLabel
          ? ["Knowledge collection binding required"]
          : [],
    },
    {
      id: "tools",
      label: "Tools",
      ready: (preview?.tools.enabledKeys.length ?? 0) > 0,
      missing: (preview?.tools.enabledKeys.length ?? 0) > 0 ? [] : ["At least one enabled tool"],
    },
    {
      id: "permissions",
      label: "Permissions",
      ready: !issuesIncludeCategory(preview, "permissions"),
      missing: collectIssueMessages(preview, "permissions"),
    },
    {
      id: "limits",
      label: "Limits",
      ready: !issuesIncludeCategory(preview, "limits"),
      missing: collectIssueMessages(preview, "limits"),
    },
  ];

  const readyCount = categories.filter((category) => category.ready).length;
  const score = Math.round((readyCount / categories.length) * 100);

  return {
    score,
    ready: preview?.ready ?? false,
    categories,
  };
}

function issuesIncludeCategory(
  preview: AgentRuntimeConfiguration | null,
  category: AiEmployeeValidationCategory,
): boolean {
  return (preview?.validationIssues ?? []).some((issue) => resolveCategory(issue.field) === category);
}

function collectIssueMessages(
  preview: AgentRuntimeConfiguration | null,
  category: AiEmployeeValidationCategory,
): string[] {
  return (preview?.validationIssues ?? [])
    .filter((issue) => resolveCategory(issue.field) === category)
    .map((issue) => issue.message);
}

export function hasBlockingPublishIssues(result: AiEmployeeValidationResult): boolean {
  return result.issues.some((issue) => issue.severity === "error");
}
