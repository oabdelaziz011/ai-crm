import type { TFunction } from "i18next";

const CATEGORY_ORDER = [
  "knowledge",
  "support",
  "crm",
  "sales",
  "scheduling",
  "billing",
  "handoff",
  "automation",
] as const;

export function formatToolNameLabel(
  t: TFunction<"common">,
  toolKey: string,
  fallback?: string | null,
): string {
  return t(`aiEmployees.tools.names.${toolKey}`, {
    defaultValue: fallback?.trim() || toolKey,
  });
}

export function formatToolCategoryLabel(
  t: TFunction<"common">,
  category: string,
  fallback?: string | null,
): string {
  const key = category.trim().toLowerCase();
  return t(`aiEmployees.tools.categories.${key}`, {
    defaultValue: fallback?.trim() || category,
  });
}

export function compareToolCategoryOrder(a: string, b: string): number {
  const ai = CATEGORY_ORDER.indexOf(a.toLowerCase() as (typeof CATEGORY_ORDER)[number]);
  const bi = CATEGORY_ORDER.indexOf(b.toLowerCase() as (typeof CATEGORY_ORDER)[number]);
  const aRank = ai === -1 ? CATEGORY_ORDER.length : ai;
  const bRank = bi === -1 ? CATEGORY_ORDER.length : bi;
  if (aRank !== bRank) return aRank - bRank;
  return a.localeCompare(b);
}

export function groupToolsByCategory<T extends { key: string; category: string }>(
  tools: readonly T[],
): Array<{ category: string; tools: T[] }> {
  const map = new Map<string, T[]>();
  for (const tool of tools) {
    const category = tool.category?.trim() || "other";
    const list = map.get(category) ?? [];
    list.push(tool);
    map.set(category, list);
  }

  return [...map.entries()]
    .sort(([a], [b]) => compareToolCategoryOrder(a, b))
    .map(([category, grouped]) => ({
      category,
      tools: [...grouped].sort((left, right) => left.key.localeCompare(right.key)),
    }));
}
