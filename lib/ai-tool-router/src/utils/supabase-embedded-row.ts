/**
 * PostgREST / generated Supabase types often model many-to-one embeds as T | T[].
 * Runtime `!inner` embeds are a single object; unwrap at the boundary.
 */
export function readEmbeddedRow<T extends object>(
  value: T | T[] | null | undefined,
): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? first : null;
  }
  return value;
}
