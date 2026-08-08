import {
  readInteractiveListInputKey,
  readInteractiveListOutputVariable,
  resolveInteractiveListStoredRecord,
  resolveInteractiveListStoredValue,
  type InteractiveListRow as ConfigInteractiveListRow,
} from "./interactive-list-variable.js";
import {
  flattenInteractiveListSections,
  readInteractiveListPaginationState,
  resolveInteractiveListRowByReplyId,
  type InteractiveListRow,
  type InteractiveListSection,
} from "./interactive-list-pagination.js";

const USER_FRIENDLY_SELECTION_ERROR =
  "That selection is no longer available. Please choose an option from the list again.";

export type InteractiveListSelectionResolveResult =
  | {
      ok: true;
      variablePatch: Record<string, unknown>;
      matchedRow: InteractiveListRow | null;
      storedRecord: Record<string, unknown> | null;
    }
  | {
      ok: false;
      userMessage: string;
      errorMessage: string;
    };

function readRowsFromConfig(config: Record<string, unknown>): InteractiveListRow[] {
  const sections = Array.isArray(config.sections) ? (config.sections as InteractiveListSection[]) : [];
  return flattenInteractiveListSections(sections).rows;
}

/** True when the offered catalog includes structured option records. */
export function catalogOffersRecords(rows: InteractiveListRow[]): boolean {
  return rows.some((row) => row.record != null && typeof row.record === "object" && !Array.isArray(row.record));
}

/**
 * Resolve an interactive list reply to workflow variables.
 * When the catalog offered records, always restore the full record — never a bare reply id.
 */
export function resolveInteractiveListSelection(input: {
  config: Record<string, unknown>;
  nodeId: string;
  variables: Record<string, unknown>;
  replyId: string;
  lookupSections?: InteractiveListSection[] | null;
}): InteractiveListSelectionResolveResult {
  const replyId = input.replyId.trim();
  if (!replyId) {
    return {
      ok: false,
      userMessage: USER_FRIENDLY_SELECTION_ERROR,
      errorMessage: "Interactive list selection missing reply id.",
    };
  }

  const outputVariable = readInteractiveListOutputVariable(input.config);
  const inputKey = readInteractiveListInputKey(input.config);
  const targetVariable = outputVariable ?? inputKey;
  if (!targetVariable) {
    return { ok: true, variablePatch: {}, matchedRow: null, storedRecord: null };
  }

  const paginationState = readInteractiveListPaginationState(input.variables, input.nodeId);
  const lookupRows = input.lookupSections
    ? flattenInteractiveListSections(input.lookupSections).rows
    : [];
  const configRows = readRowsFromConfig(input.config);

  const catalogRows =
    paginationState && paginationState.rows.length > 0
      ? paginationState.rows
      : lookupRows.length > 0
        ? lookupRows
        : configRows;

  const matchedRow =
    resolveInteractiveListRowByReplyId(catalogRows, replyId) ??
    resolveInteractiveListRowByReplyId(lookupRows, replyId) ??
    resolveInteractiveListRowByReplyId(configRows, replyId);

  const storedRecord =
    matchedRow?.record ??
    resolveInteractiveListStoredRecord(input.config, replyId);

  const expectsRecord = catalogOffersRecords(catalogRows);

  if (expectsRecord) {
    if (!storedRecord) {
      return {
        ok: false,
        userMessage: USER_FRIENDLY_SELECTION_ERROR,
        errorMessage: `Interactive list selection for node ${input.nodeId} did not restore a full option record for replyId=${replyId}.`,
      };
    }
    return {
      ok: true,
      variablePatch: { [targetVariable]: storedRecord },
      matchedRow,
      storedRecord,
    };
  }

  // Scalar / static lists without records — store value or id.
  const storedValue =
    matchedRow?.value ??
    matchedRow?.id ??
    resolveInteractiveListStoredValue(input.config, replyId);

  if (storedValue == null) {
    return {
      ok: false,
      userMessage: USER_FRIENDLY_SELECTION_ERROR,
      errorMessage: `Interactive list selection for node ${input.nodeId} could not resolve replyId=${replyId}.`,
    };
  }

  return {
    ok: true,
    variablePatch: { [targetVariable]: storedValue },
    matchedRow,
    storedRecord: null,
  };
}

export type { ConfigInteractiveListRow };
