import { listUnmappedColumns } from "./validate.js";
import type {
  CustomerImportValidationSummary,
  DuplicateCandidate,
  FieldMappingEntry,
  NormalizedImportRow,
} from "./types.js";

export function buildValidationSummary(
  rows: NormalizedImportRow[],
  duplicates: DuplicateCandidate[],
  mappings: FieldMappingEntry[],
): CustomerImportValidationSummary {
  const dupByRow = new Map<number, DuplicateCandidate>();
  for (const dup of duplicates) {
    if (!dupByRow.has(dup.rowNumber)) dupByRow.set(dup.rowNumber, dup);
  }

  let validRows = 0;
  let errorRows = 0;
  let warningRows = 0;
  let expectedInserts = 0;
  let expectedUpdates = 0;
  let expectedSkips = 0;
  let expectedFlags = 0;

  for (const row of rows) {
    const hasError = row.issues.some((issue) => issue.severity === "error");
    const hasWarning = row.issues.some((issue) => issue.severity === "warning");
    if (hasError) {
      errorRows += 1;
      continue;
    }
    validRows += 1;
    if (hasWarning) warningRows += 1;

    const dup = dupByRow.get(row.rowNumber);
    if (!dup) {
      expectedInserts += 1;
      continue;
    }
    if (dup.policyAction === "update") expectedUpdates += 1;
    else if (dup.policyAction === "flag") expectedFlags += 1;
    else expectedSkips += 1;
  }

  return {
    totalRows: rows.length,
    validRows,
    errorRows,
    warningRows,
    duplicateCandidates: duplicates.length,
    expectedInserts,
    expectedUpdates,
    expectedSkips,
    expectedFlags,
    unmappedColumns: listUnmappedColumns(mappings),
  };
}
