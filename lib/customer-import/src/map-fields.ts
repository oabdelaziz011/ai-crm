import { CUSTOMER_IMPORT_FIELDS } from "./fields.js";
import { normalizeImportHeader } from "./normalize-header.js";
import type {
  CustomerImportTargetFieldId,
  FieldMappingEntry,
  ParsedSourceColumn,
} from "./types.js";

function findSuggestedTarget(header: string): {
  id: CustomerImportTargetFieldId;
  confidence: "exact" | "alias";
} | null {
  const normalized = normalizeImportHeader(header);
  if (!normalized) return null;

  for (const field of CUSTOMER_IMPORT_FIELDS) {
    for (const alias of field.aliases) {
      const aliasNorm = normalizeImportHeader(alias);
      if (aliasNorm === normalized) {
        return {
          id: field.id,
          confidence: aliasNorm === normalizeImportHeader(field.id) ? "exact" : "alias",
        };
      }
    }
  }
  return null;
}

/**
 * Suggest mappings. Ambiguous duplicate targets are left unmapped after the first claim.
 * Low-confidence guesses are never forced.
 */
export function suggestFieldMappings(columns: ParsedSourceColumn[]): FieldMappingEntry[] {
  const claimed = new Set<CustomerImportTargetFieldId>();
  return columns.map((column) => {
    const suggestion = findSuggestedTarget(column.header);
    if (!suggestion || claimed.has(suggestion.id)) {
      return {
        sourceColumnIndex: column.index,
        sourceHeader: column.header,
        targetFieldId: null,
        ignored: false,
        confidence: "none",
        reason: suggestion && claimed.has(suggestion.id) ? "target_already_mapped" : undefined,
      };
    }
    claimed.add(suggestion.id);
    return {
      sourceColumnIndex: column.index,
      sourceHeader: column.header,
      targetFieldId: suggestion.id,
      ignored: false,
      confidence: suggestion.confidence,
    };
  });
}

export function applyManualMapping(
  current: FieldMappingEntry[],
  sourceColumnIndex: number,
  targetFieldId: CustomerImportTargetFieldId | null,
  ignored = false,
): FieldMappingEntry[] {
  const next = current.map((entry) => {
    if (entry.sourceColumnIndex !== sourceColumnIndex) {
      if (
        targetFieldId &&
        !ignored &&
        entry.targetFieldId === targetFieldId &&
        !entry.ignored
      ) {
        return { ...entry, targetFieldId: null, confidence: "none" as const, reason: "cleared_for_unique_target" };
      }
      return entry;
    }
    return {
      ...entry,
      targetFieldId: ignored ? null : targetFieldId,
      ignored,
      confidence: ignored || !targetFieldId ? ("none" as const) : ("exact" as const),
      reason: ignored ? "ignored" : undefined,
    };
  });
  return next;
}

export function assertMappingReady(mappings: FieldMappingEntry[]): {
  ok: true;
} | { ok: false; code: string; message: string } {
  const nameMapped = mappings.some(
    (entry) => !entry.ignored && entry.targetFieldId === "name",
  );
  if (!nameMapped) {
    return {
      ok: false,
      code: "name_required",
      message: "Map a source column to the customer name field before validating.",
    };
  }

  const targets = new Map<CustomerImportTargetFieldId, number>();
  for (const entry of mappings) {
    if (entry.ignored || !entry.targetFieldId) continue;
    targets.set(entry.targetFieldId, (targets.get(entry.targetFieldId) ?? 0) + 1);
  }
  for (const [field, count] of targets) {
    if (count > 1) {
      return {
        ok: false,
        code: "duplicate_target",
        message: `Target field "${field}" is mapped more than once.`,
      };
    }
  }
  return { ok: true };
}
