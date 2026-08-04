import type { OperationsWorkspaceConfig } from "../types/metadata-types.js";
import { buildDefaultOperationsWorkspaceConfig } from "./default-operations-workspace-config.js";

export type OperationsConfigDiffEntry = {
  path: string;
  before: unknown;
  after: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMergePlainObjects(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    const next = patch[key];
    const prev = result[key];
    if (isPlainObject(prev) && isPlainObject(next)) {
      result[key] = deepMergePlainObjects(prev, next);
    } else if (next !== undefined) {
      result[key] = next;
    }
  }
  return result;
}

/** Deep-merge partial config onto a base operations workspace blob. */
export function deepMergeOperationsConfig(
  base: OperationsWorkspaceConfig,
  patch: Partial<OperationsWorkspaceConfig> | Record<string, unknown>,
): OperationsWorkspaceConfig {
  const result = structuredClone(base) as Record<string, unknown>;
  const source = patch as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const next = source[key];
    const prev = result[key];
    if (isPlainObject(prev) && isPlainObject(next)) {
      result[key] = deepMergePlainObjects(prev, next);
      continue;
    }
    if (next !== undefined) result[key] = next;
  }

  return result as unknown as OperationsWorkspaceConfig;
}

/** Merge stored config with template defaults for missing nested sections. */
export function normalizeOperationsWorkspaceConfig(
  raw: Record<string, unknown>,
  templateKey: string,
  companyId: string,
): OperationsWorkspaceConfig {
  const defaults = buildDefaultOperationsWorkspaceConfig(templateKey, companyId);
  return deepMergeOperationsConfig(defaults, raw);
}

/** Produce shallow path diffs between two configs (for audit / version compare). */
export function diffOperationsConfig(
  before: OperationsWorkspaceConfig,
  after: OperationsWorkspaceConfig,
): OperationsConfigDiffEntry[] {
  const entries: OperationsConfigDiffEntry[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    const a = (before as Record<string, unknown>)[key];
    const b = (after as Record<string, unknown>)[key];
    const serializedA = JSON.stringify(a);
    const serializedB = JSON.stringify(b);
    if (serializedA !== serializedB) {
      entries.push({ path: key, before: a, after: b });
    }
  }

  return entries;
}

/** Reset a top-level config section to template defaults. */
export function resetOperationsConfigSection(
  config: OperationsWorkspaceConfig,
  section: keyof OperationsWorkspaceConfig,
): OperationsWorkspaceConfig {
  const defaults = buildDefaultOperationsWorkspaceConfig(config.templateKey, config.companyId);
  return {
    ...config,
    [section]: defaults[section],
    updatedAt: new Date().toISOString(),
  };
}
