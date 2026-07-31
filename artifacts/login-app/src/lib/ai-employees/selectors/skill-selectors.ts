import type { ToolMetadataEntry } from "@/lib/ai-employees/adapters/tool-metadata-adapter";
import type {
  AiSkillAnalytics,
  AiSkillDbRow,
  AiSkillDependencyRecord,
  AiSkillDocumentation,
  AiSkillDocumentationView,
  AiSkillListFilter,
  AiSkillMarketplaceEntry,
  AiSkillReadinessScore,
  AiSkillRecord,
  AiSkillRuntimeRecommendations,
  AiSkillValidationResult,
  AiSkillVersionSnapshot,
} from "@/lib/ai-employees/types";

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readUuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function mapSkillRow(row: AiSkillDbRow): AiSkillRecord {
  const runtimeRecommendations = (row.runtime_recommendations ?? {}) as AiSkillRuntimeRecommendations;
  const documentation = (row.documentation ?? {}) as AiSkillDocumentation;

  return {
    id: row.id,
    key: row.key,
    name: row.name,
    displayName: row.display_name,
    description: row.description,
    category: row.category,
    tags: readStringArray(row.tags),
    toolKeys: readStringArray(row.tool_keys),
    requiredPermissions: readStringArray(row.required_permissions),
    requiredKnowledgeIds: readUuidArray(row.required_knowledge_ids),
    runtimeRecommendations,
    documentation,
    status: row.status,
    publishedVersionId: row.published_version_id ?? null,
    currentVersionNumber: row.current_version_number ?? 0,
    hasUnpublishedDraft: row.has_unpublished_draft ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSkillRows(rows: AiSkillDbRow[]): AiSkillRecord[] {
  return rows.map(mapSkillRow);
}

export function skillToVersionSnapshot(skill: AiSkillRecord): AiSkillVersionSnapshot {
  return {
    displayName: skill.displayName,
    description: skill.description,
    category: skill.category,
    tags: [...skill.tags],
    toolKeys: [...skill.toolKeys],
    requiredPermissions: [...skill.requiredPermissions],
    requiredKnowledgeIds: [...skill.requiredKnowledgeIds],
    runtimeRecommendations: { ...skill.runtimeRecommendations },
    documentation: { ...skill.documentation },
  };
}

export function summarizeSkills(skills: AiSkillRecord[]): string {
  if (skills.length === 0) return "No skills assigned";
  if (skills.length === 1) return skills[0]!.displayName;
  if (skills.length <= 3) return skills.map((skill) => skill.displayName).join(", ");
  return `${skills.length} skills assigned`;
}

export function resolveToolsFromSkills(
  skills: AiSkillRecord[],
  dependencySkills: AiSkillRecord[] = [],
): string[] {
  const keys = new Set<string>();
  for (const skill of [...skills, ...dependencySkills]) {
    for (const toolKey of skill.toolKeys) {
      keys.add(toolKey);
    }
  }
  return [...keys];
}

export function resolveEffectiveToolKeys(
  directToolKeys: string[],
  skills: AiSkillRecord[],
  allSkillsById: Map<string, AiSkillRecord>,
  dependencyEdges: Array<{ skillId: string; dependsOnSkillId: string }>,
): string[] {
  const dependencySkills: AiSkillRecord[] = [];
  const visited = new Set<string>();

  function collectDependencies(skillId: string) {
    if (visited.has(skillId)) return;
    visited.add(skillId);
    for (const edge of dependencyEdges) {
      if (edge.skillId !== skillId) continue;
      const dep = allSkillsById.get(edge.dependsOnSkillId);
      if (dep) {
        dependencySkills.push(dep);
        collectDependencies(dep.id);
      }
    }
  }

  for (const skill of skills) {
    collectDependencies(skill.id);
  }

  return [...new Set([...directToolKeys, ...resolveToolsFromSkills(skills, dependencySkills)])];
}

export function detectCircularDependencies(
  skillId: string,
  edges: Array<{ skillId: string; dependsOnSkillId: string }>,
): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.skillId) ?? [];
    list.push(edge.dependsOnSkillId);
    adjacency.set(edge.skillId, list);
  }

  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(node: string) {
    if (visiting.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push([...path.slice(cycleStart), node]);
      }
      return;
    }
    if (visited.has(node)) return;

    visiting.add(node);
    path.push(node);

    for (const next of adjacency.get(node) ?? []) {
      dfs(next);
    }

    path.pop();
    visiting.delete(node);
    visited.add(node);
  }

  dfs(skillId);
  return cycles;
}

export function wouldCreateCircularDependency(
  skillId: string,
  dependsOnSkillId: string,
  edges: Array<{ skillId: string; dependsOnSkillId: string }>,
): boolean {
  const nextEdges = [...edges, { skillId, dependsOnSkillId }];
  return detectCircularDependencies(skillId, nextEdges).length > 0;
}

export function buildSkillValidation(input: {
  skill: AiSkillRecord;
  knownToolKeys: Set<string>;
  knownKnowledgeIds: Set<string>;
  dependencyEdges: Array<{ skillId: string; dependsOnSkillId: string }>;
}): AiSkillValidationResult {
  const issues: AiSkillValidationResult["issues"] = [];

  if (!input.skill.displayName.trim()) {
    issues.push({ field: "displayName", code: "required", message: "Display name is required", severity: "error" });
  }

  for (const toolKey of input.skill.toolKeys) {
    if (!input.knownToolKeys.has(toolKey)) {
      issues.push({
        field: "toolKeys",
        code: "unknown_tool",
        message: `Unknown tool: ${toolKey}`,
        severity: "error",
      });
    }
  }

  for (const knowledgeId of input.skill.requiredKnowledgeIds) {
    if (!input.knownKnowledgeIds.has(knowledgeId)) {
      issues.push({
        field: "requiredKnowledgeIds",
        code: "unknown_knowledge",
        message: `Unknown knowledge source: ${knowledgeId}`,
        severity: "warning",
      });
    }
  }

  const cycles = detectCircularDependencies(input.skill.id, input.dependencyEdges);
  for (const cycle of cycles) {
    issues.push({
      field: "dependencies",
      code: "circular_dependency",
      message: `Circular dependency detected: ${cycle.join(" → ")}`,
      severity: "error",
    });
  }

  if (input.skill.toolKeys.length === 0) {
    issues.push({
      field: "toolKeys",
      code: "empty_tools",
      message: "At least one tool is required",
      severity: "warning",
    });
  }

  return {
    ready: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

export function buildSkillReadiness(input: {
  skill: AiSkillRecord;
  validation: AiSkillValidationResult;
  dependencyCount: number;
  toolCatalog: ToolMetadataEntry[];
}): AiSkillReadinessScore {
  const knownTools = new Set(input.toolCatalog.map((tool) => tool.key));
  const missingTools = input.skill.toolKeys.filter((key) => !knownTools.has(key));

  const categories: AiSkillReadinessScore["categories"] = [
    {
      id: "tools",
      label: "Tools",
      ready: missingTools.length === 0 && input.skill.toolKeys.length > 0,
      missing: missingTools.length > 0 ? missingTools.map((key) => `Missing tool: ${key}`) : input.skill.toolKeys.length === 0 ? ["No tools configured"] : [],
    },
    {
      id: "permissions",
      label: "Permissions",
      ready: input.skill.requiredPermissions.every(Boolean),
      missing: input.skill.requiredPermissions.length === 0 ? ["No permissions declared"] : [],
    },
    {
      id: "knowledge",
      label: "Knowledge",
      ready: true,
      missing: input.skill.requiredKnowledgeIds.length === 0 ? ["No knowledge requirements"] : [],
    },
    {
      id: "dependencies",
      label: "Dependencies",
      ready: !input.validation.issues.some((issue) => issue.code === "circular_dependency"),
      missing: input.validation.issues
        .filter((issue) => issue.code === "circular_dependency")
        .map((issue) => issue.message),
    },
    {
      id: "lifecycle",
      label: "Lifecycle",
      ready: input.skill.status === "published",
      missing: input.skill.status !== "published" ? [`Status is ${input.skill.status}`] : [],
    },
    {
      id: "documentation",
      label: "Documentation",
      ready: Boolean(input.skill.documentation.overview?.trim()),
      missing: input.skill.documentation.overview?.trim() ? [] : ["Overview documentation missing"],
    },
  ];

  const readyCount = categories.filter((category) => category.ready).length;
  const score = Math.round((readyCount / categories.length) * 100);

  return {
    score,
    ready: score >= 80 && input.validation.ready,
    categories,
  };
}

export function buildSkillDocumentationView(
  skill: AiSkillRecord,
  dependencies: AiSkillDependencyRecord[],
): AiSkillDocumentationView {
  return {
    overview: skill.documentation.overview?.trim() || skill.description || "No overview available",
    inputs: skill.documentation.inputs ?? [],
    outputs: skill.documentation.outputs ?? [],
    requiredTools: skill.toolKeys,
    requiredPermissions: skill.requiredPermissions,
    dependencies: dependencies.map((dep) => dep.dependsOnDisplayName ?? dep.dependsOnSkillId),
    versionLabel: skill.currentVersionNumber > 0 ? `v${skill.currentVersionNumber}` : "draft",
  };
}

export function buildSkillAnalytics(input: {
  assignmentCount: number;
  toolExecutions: Array<{ tool_key: string; status: string; duration_ms: number | null }>;
  skillToolKeys: string[];
}): AiSkillAnalytics {
  const relevant = input.toolExecutions.filter((row) => input.skillToolKeys.includes(row.tool_key));
  const successCount = relevant.filter((row) => row.status === "success" || row.status === "completed").length;
  const failureCount = relevant.filter((row) => row.status === "failed" || row.status === "error").length;
  const durations = relevant
    .map((row) => row.duration_ms)
    .filter((value): value is number => value != null && value >= 0);

  const averageExecutionTimeMs =
    durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;

  const usageCount = relevant.length;
  const successRate = usageCount > 0 ? Math.round((successCount / usageCount) * 100) : 0;

  return {
    assignmentCount: input.assignmentCount,
    usageCount,
    successRate,
    averageExecutionTimeMs,
    failureCount,
  };
}

export function filterMarketplaceSkills(
  entries: AiSkillMarketplaceEntry[],
  filter: AiSkillListFilter,
): AiSkillMarketplaceEntry[] {
  const searchTerm = filter.search?.trim().toLowerCase();

  return entries.filter((entry) => {
    if (filter.status && filter.status !== "all" && entry.status !== filter.status) return false;
    if (filter.category && filter.category !== "all" && entry.category !== filter.category) return false;
    if (filter.favoritesOnly && !entry.isFavorite) return false;
    if (filter.tags && filter.tags.length > 0) {
      if (!filter.tags.some((tag) => entry.tags.includes(tag))) return false;
    }
    if (searchTerm) {
      const haystack = [entry.name, entry.displayName, entry.description, entry.category, entry.key, ...entry.tags]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });
}

export function selectUniqueSkillCategories(skills: AiSkillRecord[]): string[] {
  const categories = new Set<string>();
  for (const skill of skills) {
    if (skill.category.trim()) categories.add(skill.category.trim());
  }
  return [...categories].sort((a, b) => a.localeCompare(b));
}

export function aggregateSkillAnalytics(analytics: AiSkillAnalytics[]): AiSkillAnalytics {
  if (analytics.length === 0) {
    return { assignmentCount: 0, usageCount: 0, successRate: 0, averageExecutionTimeMs: 0, failureCount: 0 };
  }

  const usageCount = analytics.reduce((sum, item) => sum + item.usageCount, 0);
  const failureCount = analytics.reduce((sum, item) => sum + item.failureCount, 0);
  const successWeighted = analytics.reduce((sum, item) => sum + item.successRate * item.usageCount, 0);
  const durationWeighted = analytics.reduce((sum, item) => sum + item.averageExecutionTimeMs * item.usageCount, 0);

  return {
    assignmentCount: analytics.reduce((sum, item) => sum + item.assignmentCount, 0),
    usageCount,
    successRate: usageCount > 0 ? Math.round(successWeighted / usageCount) : 0,
    averageExecutionTimeMs: usageCount > 0 ? Math.round(durationWeighted / usageCount) : 0,
    failureCount,
  };
}

export function deriveRecentlyUsedSkillIds(
  events: Array<{ event_type: string; metadata: Record<string, unknown>; created_at: string }>,
  limit = 5,
): string[] {
  const recent: string[] = [];
  for (const event of events) {
    const skillId = typeof event.metadata.skillId === "string" ? event.metadata.skillId : null;
    if (!skillId || recent.includes(skillId)) continue;
    recent.push(skillId);
    if (recent.length >= limit) break;
  }
  return recent;
}

export function computeRequiredPermissionsFromTools(
  toolKeys: string[],
  toolCatalog: ToolMetadataEntry[],
): string[] {
  const permissions = new Set<string>();
  const catalogByKey = new Map(toolCatalog.map((tool) => [tool.key, tool]));
  for (const key of toolKeys) {
    const tool = catalogByKey.get(key);
    for (const permission of tool?.requiredPermissions ?? []) {
      permissions.add(permission);
    }
  }
  return [...permissions];
}
