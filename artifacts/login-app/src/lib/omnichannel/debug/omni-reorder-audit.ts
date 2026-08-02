import { OMNI_RENDER_TARGET_ID, OMNI_RENDER_TARGET_NUMBER } from "@/lib/omnichannel/debug/omni-render-audit";

const RT = "[OMNI_REORDER]";

export type OmniReorderStage = {
  at: string;
  stage: string;
  file: string;
  function: string;
  line: number;
  targetIndexBefore: number | null;
  targetIndexAfter: number | null;
  targetIndexChanged: boolean;
  first10IdsBefore: string[];
  first10IdsAfter: string[];
  arrayReferenceChanged: boolean;
  sortCalled: boolean;
  comparator: string | null;
  countBefore: number;
  countAfter: number;
  orderChangedAmongSurvivors: boolean;
  stackTrace: string | null;
  why: string | null;
  extra?: Record<string, unknown>;
};

export type OmniFirstReorder = {
  stage: string;
  file: string;
  function: string;
  line: number;
  beforeIndex: number;
  afterIndex: number;
  why: string;
  sortCalled: boolean;
  comparator: string | null;
};

declare global {
  interface Window {
    __OMNI_REORDER_PIPELINE__?: {
      targetId: string;
      targetNumber: string;
      stages: OmniReorderStage[];
      firstReorder: OmniFirstReorder | null;
    };
  }
}

function ensureState() {
  if (typeof window === "undefined") {
    return {
      targetId: OMNI_RENDER_TARGET_ID,
      targetNumber: OMNI_RENDER_TARGET_NUMBER,
      stages: [] as OmniReorderStage[],
      firstReorder: null as OmniFirstReorder | null,
    };
  }
  window.__OMNI_REORDER_PIPELINE__ ??= {
    targetId: OMNI_RENDER_TARGET_ID,
    targetNumber: OMNI_RENDER_TARGET_NUMBER,
    stages: [],
    firstReorder: null,
  };
  return window.__OMNI_REORDER_PIPELINE__;
}

function idsOf(rows: ReadonlyArray<{ id: string }>): string[] {
  return rows.map((r) => r.id);
}

function targetIndexOf(rows: ReadonlyArray<{ id: string }>): number | null {
  const index = rows.findIndex((r) => r.id === OMNI_RENDER_TARGET_ID);
  return index >= 0 ? index : null;
}

function orderChangedAmongSurvivors(before: string[], after: string[]): boolean {
  const afterSet = new Set(after);
  const beforeSurvivors = before.filter((id) => afterSet.has(id));
  const afterSurvivors = after.filter((id) => before.includes(id));
  if (beforeSurvivors.length !== afterSurvivors.length) return false;
  return beforeSurvivors.some((id, i) => id !== afterSurvivors[i]);
}

function buildWhy(input: {
  sortCalled: boolean;
  comparator: string | null;
  countBefore: number;
  countAfter: number;
  targetIndexBefore: number | null;
  targetIndexAfter: number | null;
  orderChangedAmongSurvivors: boolean;
}): string | null {
  if (input.targetIndexBefore === input.targetIndexAfter && !input.orderChangedAmongSurvivors) {
    return null;
  }
  if (input.sortCalled && input.comparator) {
    return `sort() with comparator "${input.comparator}" moved target from index ${input.targetIndexBefore} to ${input.targetIndexAfter}`;
  }
  if (input.countBefore !== input.countAfter && input.orderChangedAmongSurvivors) {
    return `filter removed ${input.countBefore - input.countAfter} row(s) and survivor order changed`;
  }
  if (input.countBefore !== input.countAfter) {
    return `filter removed ${input.countBefore - input.countAfter} row(s); target index shifted ${input.targetIndexBefore} → ${input.targetIndexAfter}`;
  }
  if (input.orderChangedAmongSurvivors) {
    return `survivor order changed without sort(); target index ${input.targetIndexBefore} → ${input.targetIndexAfter}`;
  }
  if (input.targetIndexBefore !== input.targetIndexAfter) {
    return `target index changed ${input.targetIndexBefore} → ${input.targetIndexAfter}`;
  }
  return null;
}

export function traceReorderStage(input: {
  stage: string;
  file: string;
  function: string;
  line: number;
  before: ReadonlyArray<{ id: string }>;
  after: ReadonlyArray<{ id: string }>;
  arrayReferenceChanged?: boolean;
  sortCalled?: boolean;
  comparator?: string | null;
  stackTrace?: string | null;
  extra?: Record<string, unknown>;
}): OmniReorderStage {
  const beforeIds = idsOf(input.before);
  const afterIds = idsOf(input.after);
  const targetIndexBefore = targetIndexOf(input.before);
  const targetIndexAfter = targetIndexOf(input.after);
  const targetIndexChanged = targetIndexBefore !== targetIndexAfter;
  const survivorsReordered = orderChangedAmongSurvivors(beforeIds, afterIds);
  const sortCalled = input.sortCalled ?? false;
  const comparator = input.comparator ?? null;
  const why = buildWhy({
    sortCalled,
    comparator,
    countBefore: input.before.length,
    countAfter: input.after.length,
    targetIndexBefore,
    targetIndexAfter,
    orderChangedAmongSurvivors: survivorsReordered,
  });

  const entry: OmniReorderStage = {
    at: new Date().toISOString(),
    stage: input.stage,
    file: input.file,
    function: input.function,
    line: input.line,
    targetIndexBefore,
    targetIndexAfter,
    targetIndexChanged,
    first10IdsBefore: beforeIds.slice(0, 10),
    first10IdsAfter: afterIds.slice(0, 10),
    arrayReferenceChanged: input.arrayReferenceChanged ?? input.before !== input.after,
    sortCalled,
    comparator,
    countBefore: input.before.length,
    countAfter: input.after.length,
    orderChangedAmongSurvivors: survivorsReordered,
    stackTrace: input.stackTrace ?? null,
    why,
    extra: input.extra,
  };

  const state = ensureState();
  state.stages.push(entry);

  const indexMoved = targetIndexBefore !== null
    && targetIndexAfter !== null
    && targetIndexBefore !== targetIndexAfter;

  if (indexMoved && !state.firstReorder) {
    state.firstReorder = {
      stage: input.stage,
      file: input.file,
      function: input.function,
      line: input.line,
      beforeIndex: targetIndexBefore,
      afterIndex: targetIndexAfter,
      why: why ?? `target index ${targetIndexBefore} → ${targetIndexAfter}`,
      sortCalled,
      comparator,
    };
    console.info(`${RT} FIRST_REORDER_STAGE`, state.firstReorder);
  }

  console.info(RT, input.stage, entry);
  return entry;
}

export function captureSortStackTrace(): string {
  const stack = new Error("omni-reorder sort()").stack ?? "";
  return stack.split("\n").slice(1, 8).join("\n");
}

export function summarizeOmniReorderPipeline() {
  const state = ensureState();
  return {
    targetId: state.targetId,
    targetNumber: state.targetNumber,
    firstReorder: state.firstReorder,
    stages: state.stages,
  };
}
