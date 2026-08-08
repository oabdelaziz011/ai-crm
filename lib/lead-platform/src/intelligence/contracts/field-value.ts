/**
 * Provenance wrapper for every AI-extracted field (Sprint 3.12.2).
 * confidence is a real number in [0, 1] — not the 3.12.1 null placeholder.
 */
export type FieldProvenance<T> = Readonly<{
  value: T;
  confidence: number;
  source: string;
  updatedAt: string;
}>;

export function fieldValue<T>(
  value: T,
  confidence: number,
  source: string,
  updatedAt: string = new Date().toISOString(),
): FieldProvenance<T> {
  return Object.freeze({
    value,
    confidence: clampConfidence(confidence),
    source,
    updatedAt,
  });
}

export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
