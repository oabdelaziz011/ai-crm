import { sha256Hex } from "@workspace/platform-crypto";

export function createCorrelationId(existing?: string): string {
  return existing ?? crypto.randomUUID();
}

export function estimateTokenCount(content: string, storedCount?: number): number {
  if (storedCount !== undefined && storedCount > 0) return storedCount;
  const trimmed = content.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function computeContextChecksum(chunks: Array<{ knowledgeChunkId: string; content: string }>): string {
  const payload = chunks
    .map((chunk) => `${chunk.knowledgeChunkId}:${chunk.content}`)
    .join("|");
  return sha256Hex(payload);
}

export function computeTextOverlap(left: string, right: string): number {
  const leftTokens = new Set(left.toLowerCase().split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.toLowerCase().split(/\s+/).filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  return intersection / Math.min(leftTokens.size, rightTokens.size);
}

export function computePriorityScore(
  sourceKey: string,
  department: string | null,
  sourcePriority: Record<string, number>,
  departmentPriority: Record<string, number>,
): number {
  const sourceScore = sourcePriority[sourceKey] ?? 0;
  const departmentScore = department ? (departmentPriority[department] ?? 0) : 0;
  return sourceScore + departmentScore;
}
