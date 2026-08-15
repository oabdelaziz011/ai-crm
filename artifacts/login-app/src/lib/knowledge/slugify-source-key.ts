/** Stable technical key for knowledge sources (ASCII slug). */
export function slugifyKnowledgeSourceKey(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Prefer ASCII keys; Arabic-only names fall back to a generated key.
  if (ascii) return ascii.slice(0, 64);
  return `source-${Date.now().toString(36)}`;
}
