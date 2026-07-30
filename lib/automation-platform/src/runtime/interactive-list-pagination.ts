import type { InteractiveListLimits } from "../transport/models.js";

export const INTERACTIVE_LIST_NEXT_PAGE_ROW_ID = "__automation_list_next_page__";

export const INTERACTIVE_LIST_PAGINATION_VARIABLE = "__interactiveListPagination";

export type InteractiveListRow = {
  id: string;
  title: string;
  description?: string;
  value?: string;
  record?: Record<string, unknown>;
};

export type InteractiveListSection = {
  title: string;
  rows: InteractiveListRow[];
};

export type InteractiveListPaginationState = {
  nodeId: string;
  pageIndex: number;
  totalPages: number;
  sectionTitle: string;
  rows: InteractiveListRow[];
};

export function isInteractiveListNextPageReply(replyId: string | null | undefined): boolean {
  return replyId?.trim() === INTERACTIVE_LIST_NEXT_PAGE_ROW_ID;
}

export function readInteractiveListPaginationState(
  variables: Record<string, unknown>,
  nodeId: string,
): InteractiveListPaginationState | null {
  const raw = variables[INTERACTIVE_LIST_PAGINATION_VARIABLE];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const state = raw as InteractiveListPaginationState;
  if (state.nodeId !== nodeId) return null;
  if (!Array.isArray(state.rows) || state.rows.length === 0) return null;
  if (typeof state.pageIndex !== "number" || typeof state.totalPages !== "number") return null;
  return state;
}

export function clearInteractiveListPaginationState(): Record<string, null> {
  return { [INTERACTIVE_LIST_PAGINATION_VARIABLE]: null };
}

export function flattenInteractiveListSections(sections: InteractiveListSection[]): {
  sectionTitle: string;
  rows: InteractiveListRow[];
} {
  const rows: InteractiveListRow[] = [];
  let sectionTitle = "Options";

  for (const section of sections) {
    if (rows.length === 0 && section.title?.trim()) {
      sectionTitle = section.title.trim();
    }
    for (const row of section.rows) {
      rows.push(row);
    }
  }

  return { sectionTitle, rows };
}

export function computeInteractiveListPagePlan(
  totalRows: number,
  limits: InteractiveListLimits,
): { totalPages: number; pageSize: number; requiresPagination: boolean } {
  const maxRows = limits.maxRowsPerList;
  if (!Number.isFinite(maxRows) || totalRows <= maxRows) {
    return { totalPages: 1, pageSize: totalRows, requiresPagination: false };
  }

  const pageSize = Math.max(1, maxRows - 1);
  const totalPages = Math.ceil(totalRows / pageSize);
  return { totalPages, pageSize, requiresPagination: true };
}

export function sliceInteractiveListPageRows(
  rows: InteractiveListRow[],
  pageIndex: number,
  limits: InteractiveListLimits,
): InteractiveListRow[] {
  const plan = computeInteractiveListPagePlan(rows.length, limits);
  if (!plan.requiresPagination) return rows;

  const start = pageIndex * plan.pageSize;
  const end = Math.min(start + plan.pageSize, rows.length);
  const pageRows = rows.slice(start, end);
  const hasMore = pageIndex < plan.totalPages - 1;

  if (hasMore) {
    return [
      ...pageRows,
      {
        id: INTERACTIVE_LIST_NEXT_PAGE_ROW_ID,
        title: "Next",
        description: `Page ${pageIndex + 2} of ${plan.totalPages}`,
      },
    ];
  }

  return pageRows;
}

export function buildPaginatedInteractiveListSections(
  rows: InteractiveListRow[],
  pageIndex: number,
  limits: InteractiveListLimits,
  sectionTitle = "Options",
): InteractiveListSection[] {
  const pageRows = sliceInteractiveListPageRows(rows, pageIndex, limits);
  if (pageRows.length === 0) return [];
  return [{ title: sectionTitle, rows: pageRows }];
}

export function createInteractiveListPaginationState(input: {
  nodeId: string;
  sectionTitle: string;
  rows: InteractiveListRow[];
  limits: InteractiveListLimits;
  pageIndex?: number;
}): InteractiveListPaginationState {
  const plan = computeInteractiveListPagePlan(input.rows.length, input.limits);
  return {
    nodeId: input.nodeId,
    pageIndex: input.pageIndex ?? 0,
    totalPages: plan.totalPages,
    sectionTitle: input.sectionTitle,
    rows: input.rows,
  };
}

export function applyInteractiveListPaginationToSections(
  sections: InteractiveListSection[],
  input: {
    nodeId: string;
    limits: InteractiveListLimits;
    variables: Record<string, unknown>;
    pageIndex?: number;
  },
): {
  sections: InteractiveListSection[];
  paginationState: InteractiveListPaginationState | null;
} {
  const { sectionTitle, rows } = flattenInteractiveListSections(sections);
  const plan = computeInteractiveListPagePlan(rows.length, input.limits);
  if (!plan.requiresPagination || !input.limits.supportsListPagination) {
    return { sections, paginationState: null };
  }

  const pageIndex = input.pageIndex ?? readInteractiveListPaginationState(input.variables, input.nodeId)?.pageIndex ?? 0;
  const paginationState = createInteractiveListPaginationState({
    nodeId: input.nodeId,
    sectionTitle,
    rows,
    limits: input.limits,
    pageIndex,
  });

  return {
    sections: buildPaginatedInteractiveListSections(rows, pageIndex, input.limits, sectionTitle),
    paginationState,
  };
}

export function resolveInteractiveListRowByReplyId(
  rows: InteractiveListRow[],
  replyId: string,
): InteractiveListRow | null {
  const normalized = replyId.trim();
  if (!normalized) return null;
  return rows.find((row) => row.id === normalized) ?? null;
}
