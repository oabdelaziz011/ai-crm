import type { AiEmployeeDbRow, AiEmployeeRecord } from "@/lib/ai-employees/types";
import {
  DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
  type AiEmployeeRuntimeConfiguration,
  type AiEmployeeRuntimeConfigurationStored,
} from "@/lib/ai-employees/adapters";

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readUuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function mapAiEmployeeRow(row: AiEmployeeDbRow, ownerLabel?: string | null): AiEmployeeRecord {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    description: row.description,
    avatar: row.avatar,
    department: row.department,
    owner: ownerLabel ?? row.owner_id,
    ownerId: row.owner_id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    systemPrompt: row.system_prompt,
    systemPromptSummary: row.system_prompt_summary,
    knowledgeSourceIds: readStringArray(row.knowledge_source_ids),
    knowledgeSummary: row.knowledge_summary,
    allowedToolKeys: readStringArray(row.allowed_tool_keys),
    toolSummary: row.tool_summary,
    allowedSkillIds: readUuidArray(row.allowed_skill_ids),
    skillsSummary: row.skills_summary ?? "No skills assigned",
    tags: readStringArray(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    promptVersionLabel: row.prompt_version_label ?? "v1",
    runtimeConfiguration: mapRuntimeConfiguration(row.runtime_configuration),
    publishedVersionId: row.published_version_id ?? null,
    currentVersionNumber: row.current_version_number ?? 0,
    hasUnpublishedDraft: row.has_unpublished_draft ?? false,
  };
}

function mapRuntimeConfiguration(value: unknown): AiEmployeeRuntimeConfiguration {
  const stored = (value ?? {}) as Partial<AiEmployeeRuntimeConfigurationStored>;
  const defaults = DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION;
  const runtimeFlags = {
    ...defaults.runtimeFlags,
    ...(stored.runtimeFlags ?? {}),
  };
  const retrievalPolicy = {
    ...defaults.retrievalPolicy,
    ...(stored.retrievalPolicy ?? {}),
  };

  return {
    executionTimeoutMs: stored.executionTimeoutMs ?? defaults.executionTimeoutMs,
    retryCount: stored.retryCount ?? defaults.retryCount,
    rateLimitPerMinute: stored.rateLimitPerMinute ?? defaults.rateLimitPerMinute,
    maxConcurrency: stored.maxConcurrency ?? defaults.maxConcurrency,
    disabledToolKeys: readStringArray(stored.disabledToolKeys),
    runtimeFlags,
    retrievalPolicy,
  };
}

export function mapAiEmployeeRows(
  rows: AiEmployeeDbRow[],
  ownerLabels?: Map<string, string>,
): AiEmployeeRecord[] {
  return rows.map((row) =>
    mapAiEmployeeRow(row, row.owner_id ? ownerLabels?.get(row.owner_id) ?? null : null),
  );
}

export function summarizeSystemPrompt(prompt: string, maxLength = 120): string {
  const trimmed = prompt.trim();
  if (!trimmed) return "No system prompt configured";
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

export function summarizeKnowledge(sourceNames: string[]): string {
  if (sourceNames.length === 0) return "No knowledge sources";
  if (sourceNames.length === 1) return sourceNames[0]!;
  if (sourceNames.length <= 3) return sourceNames.join(", ");
  return `${sourceNames.length} knowledge sources`;
}

export function summarizeSkills(skillNames: string[]): string {
  if (skillNames.length === 0) return "No skills assigned";
  if (skillNames.length === 1) return skillNames[0]!;
  if (skillNames.length <= 3) return skillNames.join(", ");
  return `${skillNames.length} skills assigned`;
}

export function summarizeTools(toolKeys: string[]): string {
  if (toolKeys.length === 0) return "No tools assigned";
  if (toolKeys.length === 1) return toolKeys[0]!;
  if (toolKeys.length <= 3) return toolKeys.join(", ");
  return `${toolKeys.length} tools assigned`;
}

export function selectUniqueDepartments(employees: AiEmployeeRecord[]): string[] {
  const departments = new Set<string>();
  for (const employee of employees) {
    if (employee.department?.trim()) {
      departments.add(employee.department.trim());
    }
  }
  return [...departments].sort((a, b) => a.localeCompare(b));
}

export function selectUniqueProviders(employees: AiEmployeeRecord[]): string[] {
  const providers = new Set<string>();
  for (const employee of employees) {
    if (employee.provider?.trim()) {
      providers.add(employee.provider.trim());
    }
  }
  return [...providers].sort((a, b) => a.localeCompare(b));
}

export function selectUniqueTags(employees: AiEmployeeRecord[]): string[] {
  const tags = new Set<string>();
  for (const employee of employees) {
    for (const tag of employee.tags) {
      if (tag.trim()) tags.add(tag.trim());
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function filterAiEmployees(
  employees: AiEmployeeRecord[],
  filter: {
    status?: string;
    department?: string;
    provider?: string;
    ownerId?: string;
    tags?: string[];
    search?: string;
  },
): AiEmployeeRecord[] {
  const searchTerm = filter.search?.trim().toLowerCase();

  return employees.filter((employee) => {
    if (filter.status && filter.status !== "all" && employee.status !== filter.status) {
      return false;
    }
    if (filter.department && filter.department !== "all" && employee.department !== filter.department) {
      return false;
    }
    if (filter.provider && filter.provider !== "all" && employee.provider !== filter.provider) {
      return false;
    }
    if (filter.ownerId && filter.ownerId !== "all" && employee.ownerId !== filter.ownerId) {
      return false;
    }
    if (filter.tags && filter.tags.length > 0) {
      const hasTag = filter.tags.some((tag) => employee.tags.includes(tag));
      if (!hasTag) return false;
    }
    if (searchTerm) {
      const haystack = [
        employee.name,
        employee.displayName,
        employee.description,
        employee.department ?? "",
        employee.provider ?? "",
        employee.model ?? "",
        employee.owner ?? "",
        ...employee.tags,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });
}
