import { randomUUID, sha256Hex } from "@workspace/platform-crypto";
import type { MetadataFilter, ProviderQueryHit } from "../types.js";

export function computeQueryChecksum(input: {
  queryVector: number[];
  collectionId: string;
  metadataFilters?: MetadataFilter;
}): string {
  const payload = [
    input.collectionId,
    input.queryVector.map((value) => value.toFixed(6)).join(","),
    JSON.stringify(input.metadataFilters ?? {}),
  ].join("|");
  return sha256Hex(payload);
}

export function createCorrelationId(correlationId?: string | null): string {
  return correlationId?.trim() || randomUUID();
}

export function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
}

export function normalizeProviderScore(providerScore: number): number {
  if (providerScore <= 1) return clampScore(providerScore);
  if (providerScore <= 100) return clampScore(providerScore / 100);
  return clampScore(1 / (1 + Math.exp(-providerScore)));
}

export function computeStubSimilarity(queryVector: number[], candidateVector: number[]): number {
  const length = Math.min(queryVector.length, candidateVector.length);
  if (length === 0) return 0;

  let dot = 0;
  let queryNorm = 0;
  let candidateNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const queryValue = queryVector[index] ?? 0;
    const candidateValue = candidateVector[index] ?? 0;
    dot += queryValue * candidateValue;
    queryNorm += queryValue * queryValue;
    candidateNorm += candidateValue * candidateValue;
  }

  if (queryNorm === 0 || candidateNorm === 0) return 0;
  return clampScore(dot / (Math.sqrt(queryNorm) * Math.sqrt(candidateNorm)));
}

export function matchesMetadataFilter(
  metadata: Record<string, unknown> | undefined,
  filters: MetadataFilter | undefined,
): boolean {
  if (!filters || Object.keys(filters).length === 0) return true;
  const source = metadata ?? {};

  return Object.entries(filters).every(([key, expected]) => {
    const actual = source[key];
    if (Array.isArray(expected)) {
      if (Array.isArray(actual)) {
        return expected.every((value) => actual.includes(value));
      }
      return expected.includes(String(actual));
    }
    return String(actual) === String(expected);
  });
}

export function dedupeHits(hits: ProviderQueryHit[]): ProviderQueryHit[] {
  const seen = new Set<string>();
  const deduped: ProviderQueryHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.vectorId)) continue;
    seen.add(hit.vectorId);
    deduped.push(hit);
  }
  return deduped;
}
