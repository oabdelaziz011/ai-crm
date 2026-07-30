/**
 * Normalizes user questions for consistent retrieval and cache keys.
 */
export function normalizeKnowledgeQuery(question: string): string {
  return question
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?!.]+$/g, "")
    .toLowerCase();
}

export function isLikelyKnowledgeQuestion(question: string): boolean {
  const normalized = normalizeKnowledgeQuery(question);
  if (normalized.length < 3) return false;
  return true;
}
