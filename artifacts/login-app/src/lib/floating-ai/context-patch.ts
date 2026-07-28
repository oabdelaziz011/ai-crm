import type { FloatingAiPageContext } from "@/lib/floating-ai/types";
import { PAGE_SPECIFIC_CONTEXT_KEYS } from "@/lib/floating-ai/types";

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      const left = a[index] as Record<string, unknown> | undefined;
      const right = b[index] as Record<string, unknown> | undefined;
      if (!left || !right) return false;
      if (left.id !== right.id || left.label !== right.label) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => Object.is(left[key], right[key]));
  }
  return false;
}

/** Returns true when patch would change any field on prev. */
export function floatingAiPatchChanged(
  prev: FloatingAiPageContext,
  patch: Partial<FloatingAiPageContext>,
): boolean {
  for (const [key, nextValue] of Object.entries(patch)) {
    if (!valuesEqual(prev[key as keyof FloatingAiPageContext], nextValue)) {
      return true;
    }
  }
  return false;
}

/** Shallow merge that skips allocation when nothing changed. */
export function applyFloatingAiPatch(
  prev: FloatingAiPageContext,
  patch: Partial<FloatingAiPageContext>,
): FloatingAiPageContext {
  if (!floatingAiPatchChanged(prev, patch)) {
    return prev;
  }
  return { ...prev, ...patch };
}

/** Compare two partial page-context registrations (used by useRegisterFloatingAiContext). */
export function floatingAiRegistrationEqual(
  left: Partial<FloatingAiPageContext> | null,
  right: Partial<FloatingAiPageContext> | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;

  const keys = new Set([
    ...Object.keys(left),
    ...Object.keys(right),
  ]) as Set<keyof FloatingAiPageContext>;

  for (const key of keys) {
    if (!valuesEqual(left[key], right[key])) {
      return false;
    }
  }
  return true;
}

export function clearPageSpecificFields(context: FloatingAiPageContext): Partial<FloatingAiPageContext> {
  const patch: Partial<FloatingAiPageContext> = {};
  for (const key of PAGE_SPECIFIC_CONTEXT_KEYS) {
    if (key === "selectedRows") {
      patch.selectedRows = [];
    } else if (key === "selectedCount") {
      patch.selectedCount = 0;
    } else if (key === "filters") {
      patch.filters = {};
    } else {
      (patch as Record<string, unknown>)[key] = null;
    }
  }
  return patch;
}
