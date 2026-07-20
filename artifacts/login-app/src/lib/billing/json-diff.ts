type FlatEntry = { path: string; value: unknown };

function flattenJson(value: unknown, prefix = ""): FlatEntry[] {
  if (value === null || value === undefined) {
    return prefix ? [{ path: prefix, value: null }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenJson(item, prefix ? `${prefix}[${index}]` : `[${index}]`));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return prefix ? [{ path: prefix, value: {} }] : [];
    return entries.flatMap(([key, nested]) => flattenJson(nested, prefix ? `${prefix}.${key}` : key));
  }
  return [{ path: prefix || "value", value }];
}

export type JsonDiffRow = {
  path: string;
  status: "added" | "removed" | "changed" | "unchanged";
  before: unknown;
  after: unknown;
};

export function buildJsonDiff(before: unknown, after: unknown): JsonDiffRow[] {
  const beforeMap = new Map(flattenJson(before).map((entry) => [entry.path, entry.value]));
  const afterMap = new Map(flattenJson(after).map((entry) => [entry.path, entry.value]));
  const paths = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  return [...paths]
    .sort((a, b) => a.localeCompare(b))
    .map((path): JsonDiffRow => {
      const hasBefore = beforeMap.has(path);
      const hasAfter = afterMap.has(path);
      const beforeValue = beforeMap.get(path);
      const afterValue = afterMap.get(path);

      if (hasBefore && !hasAfter) {
        return { path, status: "removed", before: beforeValue, after: undefined };
      }
      if (!hasBefore && hasAfter) {
        return { path, status: "added", before: undefined, after: afterValue };
      }
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        return { path, status: "changed", before: beforeValue, after: afterValue };
      }
      return { path, status: "unchanged", before: beforeValue, after: afterValue };
    })
    .filter((row) => row.status !== "unchanged");
}

export function formatDiffValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
