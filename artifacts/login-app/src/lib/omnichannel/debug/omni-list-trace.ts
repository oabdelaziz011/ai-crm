export const OMNI_LIST_TRACE_TARGET_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
export const OMNI_LIST_TRACE_TARGET_NUMBER = "CNV-000010";
const RT = "[OMNI_LIST]";

export type OmniListSupabaseFilters = {
  companyId: string;
  searchQuery?: string;
  state?: string;
  assignedUserId?: string | null;
  archived?: boolean;
  channelType?: string;
  pageSize?: number;
  page?: number;
  offset?: number;
  deletedAt: "IS NULL";
  orderBy: string;
};

export type OmniListTraceEntry = {
  at: string;
  stage: string;
  targetId: string;
  present: boolean;
  index?: number;
  detail?: Record<string, unknown>;
};

declare global {
  interface Window {
    __OMNI_LIST_LOGS?: OmniListTraceEntry[];
  }
}

function push(entry: OmniListTraceEntry) {
  console.info(RT, entry.stage, entry);
  if (typeof window !== "undefined") {
    window.__OMNI_LIST_LOGS ??= [];
    window.__OMNI_LIST_LOGS.push(entry);
  }
}

export function buildSupabaseListFilters(input: {
  companyId: string;
  searchQuery?: string;
  state?: string;
  assignedUserId?: string | null;
  archived?: boolean;
  channelType?: string;
  limit?: number;
  offset?: number;
}): OmniListSupabaseFilters {
  const pageSize = input.limit ?? 50;
  const offset = input.offset ?? 0;
  return {
    companyId: input.companyId,
    searchQuery: input.searchQuery,
    state: input.state,
    assignedUserId: input.assignedUserId,
    archived: input.archived,
    channelType: input.channelType,
    pageSize,
    page: Math.floor(offset / pageSize),
    offset,
    deletedAt: "IS NULL",
    orderBy: "last_message_at DESC NULLS LAST, created_at DESC",
  };
}

export function traceOmniListRows(
  stage: string,
  rows: Array<{ id: string; conversation_number?: string }>,
  detail?: Record<string, unknown>,
) {
  const index = rows.findIndex((r) => r.id === OMNI_LIST_TRACE_TARGET_ID);
  push({
    at: new Date().toISOString(),
    stage,
    targetId: OMNI_LIST_TRACE_TARGET_ID,
    present: index >= 0,
    index: index >= 0 ? index : undefined,
    detail: {
      rowCount: rows.length,
      ...(index >= 0
        ? { target: rows[index] }
        : {}),
      ...detail,
    },
  });
}

export function traceOmniListEvent(stage: string, detail: Record<string, unknown>) {
  push({
    at: new Date().toISOString(),
    stage,
    targetId: OMNI_LIST_TRACE_TARGET_ID,
    present: false,
    detail,
  });
}
