import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import { OMNI_RENDER_TARGET_ID, OMNI_RENDER_TARGET_NUMBER } from "@/lib/omnichannel/debug/omni-render-audit";

const RT = "[OMNI_DOM_RENDER]";

export type OmniDomRenderStage = {
  at: string;
  stage: string;
  file: string;
  function: string;
  line: number;
  present: boolean;
  count: number;
  targetIndex: number | null;
  first10Ids: string[];
  removedHere: boolean;
  removalReason: string | null;
  propsBefore?: Record<string, unknown> | null;
  propsAfter?: Record<string, unknown> | null;
  extra?: Record<string, unknown>;
};

declare global {
  interface Window {
    __OMNI_DOM_PIPELINE__?: {
      stages: OmniDomRenderStage[];
      firstRemoval: OmniDomRenderStage | null;
      domMount: OmniDomRenderStage | null;
    };
  }
}

function ensureState() {
  if (typeof window === "undefined") {
    return {
      stages: [] as OmniDomRenderStage[],
      firstRemoval: null as OmniDomRenderStage | null,
      domMount: null as OmniDomRenderStage | null,
    };
  }
  window.__OMNI_DOM_PIPELINE__ ??= { stages: [], firstRemoval: null, domMount: null };
  return window.__OMNI_DOM_PIPELINE__;
}

function idsOf(rows: ReadonlyArray<{ id: string }>): string[] {
  return rows.map((r) => r.id);
}

export function traceDomRenderStage(input: {
  stage: string;
  file: string;
  function: string;
  line: number;
  rows: ReadonlyArray<{ id: string }>;
  previousPresent?: boolean;
  removalReason?: string | null;
  propsBefore?: Record<string, unknown> | null;
  propsAfter?: Record<string, unknown> | null;
  extra?: Record<string, unknown>;
}): OmniDomRenderStage {
  const present = input.rows.some((r) => r.id === OMNI_RENDER_TARGET_ID);
  const targetIndex = present ? input.rows.findIndex((r) => r.id === OMNI_RENDER_TARGET_ID) : null;
  const previousPresent = input.previousPresent ?? true;
  const removedHere = previousPresent && !present;

  const entry: OmniDomRenderStage = {
    at: new Date().toISOString(),
    stage: input.stage,
    file: input.file,
    function: input.function,
    line: input.line,
    present,
    count: input.rows.length,
    targetIndex: targetIndex !== null && targetIndex >= 0 ? targetIndex : null,
    first10Ids: idsOf(input.rows).slice(0, 10),
    removedHere,
    removalReason: removedHere
      ? (input.removalReason ?? `${input.function} @ ${input.file}:${input.line}`)
      : null,
    propsBefore: input.propsBefore ?? null,
    propsAfter: input.propsAfter ?? null,
    extra: input.extra ?? undefined,
  };

  const state = ensureState();
  state.stages.push(entry);
  if (removedHere && !state.firstRemoval) {
    state.firstRemoval = entry;
  }
  if (input.stage.includes("QueueCard") && present) {
    state.domMount = entry;
  }

  console.info(RT, input.stage, entry);
  return entry;
}

export function traceDomRenderProps(input: {
  stage: string;
  file: string;
  function: string;
  line: number;
  propsBefore: Record<string, unknown>;
  propsAfter: Record<string, unknown>;
  conversationIdsKey: "conversations" | "visibleConversations" | "displayConversations";
}): OmniDomRenderStage {
  const beforeRows = (input.propsBefore[input.conversationIdsKey] as Array<{ id: string }> | undefined) ?? [];
  const afterRows = (input.propsAfter[input.conversationIdsKey] as Array<{ id: string }> | undefined) ?? [];
  const beforePresent = beforeRows.some((r) => r.id === OMNI_RENDER_TARGET_ID);
  const afterPresent = afterRows.some((r) => r.id === OMNI_RENDER_TARGET_ID);

  return traceDomRenderStage({
    stage: input.stage,
    file: input.file,
    function: input.function,
    line: input.line,
    rows: afterRows,
    previousPresent: beforePresent,
    removalReason:
      beforePresent && !afterPresent
        ? `${input.function} changed ${input.conversationIdsKey} @ ${input.file}:${input.line}`
        : null,
    propsBefore: {
      count: beforeRows.length,
      targetIndex: beforePresent ? beforeRows.findIndex((r) => r.id === OMNI_RENDER_TARGET_ID) : null,
      first10Ids: idsOf(beforeRows).slice(0, 10),
    },
    propsAfter: {
      count: afterRows.length,
      targetIndex: afterPresent ? afterRows.findIndex((r) => r.id === OMNI_RENDER_TARGET_ID) : null,
      first10Ids: idsOf(afterRows).slice(0, 10),
    },
  });
}

export function traceDomVirtualization(input: {
  conversations: UnifiedConversation[];
  startIndex: number;
  endIndex: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  renderedIds: string[];
  renderedKeys: string[];
}): OmniDomRenderStage {
  const listIndex = input.conversations.findIndex((c) => c.id === OMNI_RENDER_TARGET_ID);
  const inFullList = listIndex >= 0;
  const inWindow = inFullList && listIndex >= input.startIndex && listIndex < input.endIndex;
  const renderedRows = input.conversations.slice(input.startIndex, input.endIndex);
  const rowTop = listIndex * input.rowHeight - input.scrollTop;
  const rowBottom = rowTop + input.rowHeight;
  const outsideViewport = rowBottom < 0 || rowTop > input.viewportHeight;

  return traceDomRenderStage({
    stage: "InboxColumn.virtualization",
    file: "inbox-column.tsx",
    function: "InboxColumn",
    line: 128,
    rows: renderedRows,
    previousPresent: inFullList,
    removalReason: inFullList && !inWindow
      ? `virtual window [${input.startIndex}, ${input.endIndex}) excludes target index ${listIndex}`
      : null,
    extra: {
      totalRows: input.conversations.length,
      firstRenderedIndex: input.startIndex,
      lastRenderedIndex: input.endIndex - 1,
      scrollTop: input.scrollTop,
      containerHeight: input.viewportHeight,
      rowHeight: input.rowHeight,
      targetIndex: listIndex >= 0 ? listIndex : null,
      targetInRenderedWindow: inWindow,
      targetOutsideViewport: inWindow ? outsideViewport : true,
      renderedIds: input.renderedIds,
      renderedKeys: input.renderedKeys,
      targetInRenderedRows: input.renderedIds.includes(OMNI_RENDER_TARGET_ID),
    },
  });
}

export function traceDomQueueCardMount(input: {
  conversationId: string;
  index: number;
  active: boolean;
  node: HTMLElement | null;
}): OmniDomRenderStage | null {
  if (input.conversationId !== OMNI_RENDER_TARGET_ID) return null;

  const style = input.node ? window.getComputedStyle(input.node) : null;
  const parent = input.node?.parentElement ?? null;
  const parentStyle = parent ? window.getComputedStyle(parent) : null;

  return traceDomRenderStage({
    stage: "QueueCard.domMount",
    file: "queue-line.tsx",
    function: "QueueCard",
    line: 115,
    rows: [{ id: input.conversationId }],
    extra: {
      targetNumber: OMNI_RENDER_TARGET_NUMBER,
      index: input.index,
      active: input.active,
      reactKey: input.conversationId,
      mounted: Boolean(input.node),
      css: style
        ? {
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            pointerEvents: style.pointerEvents,
            height: style.height,
            overflow: style.overflow,
            hidden: input.node?.hidden ?? false,
            offsetHeight: input.node?.offsetHeight ?? null,
            offsetTop: input.node?.offsetTop ?? null,
            clientHeight: input.node?.clientHeight ?? null,
          }
        : null,
      parentOverflow: parentStyle?.overflow ?? null,
      parentDisplay: parentStyle?.display ?? null,
    },
  });
}

export function summarizeOmniDomPipeline() {
  const state = ensureState();
  return {
    targetId: OMNI_RENDER_TARGET_ID,
    targetNumber: OMNI_RENDER_TARGET_NUMBER,
    firstRemoval: state.firstRemoval,
    domMount: state.domMount,
    stages: state.stages,
  };
}
