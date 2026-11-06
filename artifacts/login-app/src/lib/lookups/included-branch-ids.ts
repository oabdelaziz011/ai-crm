/** Branch ids the workflow author chose to offer. Empty means every branch. */
export function parseIncludedBranchIds(expected: unknown): Set<string> | null {
  if (expected == null || expected === "") return null;
  const raw = Array.isArray(expected) ? expected.map((item) => String(item)) : String(expected).split(/[\s,]+/);
  const ids = raw
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !item.includes("{{") && !item.includes("}}"));
  if (ids.length === 0) return null;
  return new Set(ids);
}

export function recordMatchesIncludedBranchIds(recordId: unknown, expected: unknown): boolean {
  const allowed = parseIncludedBranchIds(expected);
  if (!allowed) return true;
  return allowed.has(String(recordId ?? ""));
}
