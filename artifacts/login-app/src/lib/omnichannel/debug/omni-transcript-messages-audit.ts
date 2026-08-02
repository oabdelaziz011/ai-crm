import { OMNI_RENDER_TARGET_ID } from "@/lib/omnichannel/debug/omni-render-audit";

const RT = "[OMNI_TRANSCRIPT_MSG]";
const TARGET_CONVERSATION_ID = OMNI_RENDER_TARGET_ID;

export type TranscriptMessageAuditStage = {
  stage: string;
  file: string;
  function: string;
  line: number;
  at: string;
  conversationId: string | null;
  queryKey: unknown;
  sqlWhere: string | null;
  orderBy: string | null;
  limit: number | null;
  rowCount: number | null;
  newestMessageId: string | null;
  newestCreatedAt: string | null;
  newest10: Array<{
    id: string;
    created_at: string;
    direction: string;
    content: string;
  }>;
  extra?: Record<string, unknown>;
};

export type TranscriptMessageFirstDivergence = {
  stage: string;
  file: string;
  function: string;
  line: number;
  reason: string;
  databaseNewestId: string | null;
  stageNewestId: string | null;
};

declare global {
  interface Window {
    __OMNI_TRANSCRIPT_MSG_AUDIT__?: {
      targetConversationId: string;
      stages: TranscriptMessageAuditStage[];
      firstDivergence: TranscriptMessageFirstDivergence | null;
      databaseNewestId: string | null;
      reactQueryNewestId: string | null;
      renderedNewestId: string | null;
    };
  }
}

function ensureState() {
  if (typeof window === "undefined") {
    return {
      targetConversationId: TARGET_CONVERSATION_ID,
      stages: [] as TranscriptMessageAuditStage[],
      firstDivergence: null as TranscriptMessageFirstDivergence | null,
      databaseNewestId: null as string | null,
      reactQueryNewestId: null as string | null,
      renderedNewestId: null as string | null,
    };
  }
  window.__OMNI_TRANSCRIPT_MSG_AUDIT__ ??= {
    targetConversationId: TARGET_CONVERSATION_ID,
    stages: [],
    firstDivergence: null,
    databaseNewestId: null,
    reactQueryNewestId: null,
    renderedNewestId: null,
  };
  return window.__OMNI_TRANSCRIPT_MSG_AUDIT__;
}

function summarizeRows(rows: Array<{ id: string; created_at: string; message_type?: string; content?: string }>) {
  const sorted = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const newest10 = sorted.slice(0, 10).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    direction: row.message_type ?? "unknown",
    content: (row.content ?? "").slice(0, 80),
  }));
  const newest = sorted[0] ?? null;
  return {
    rowCount: rows.length,
    newestMessageId: newest?.id ?? null,
    newestCreatedAt: newest?.created_at ?? null,
    newest10,
  };
}

export function traceTranscriptMessageStage(input: {
  stage: string;
  file: string;
  function: string;
  line: number;
  conversationId?: string | null;
  queryKey?: unknown;
  sqlWhere?: string | null;
  orderBy?: string | null;
  limit?: number | null;
  rows?: Array<{ id: string; created_at: string; message_type?: string; content?: string }>;
  extra?: Record<string, unknown>;
}) {
  const state = ensureState();
  const conversationId = input.conversationId ?? null;
  if (conversationId !== TARGET_CONVERSATION_ID && conversationId !== null) return null;

  const summary = summarizeRows(input.rows ?? []);
  const entry: TranscriptMessageAuditStage = {
    stage: input.stage,
    file: input.file,
    function: input.function,
    line: input.line,
    at: new Date().toISOString(),
    conversationId,
    queryKey: input.queryKey ?? null,
    sqlWhere: input.sqlWhere ?? null,
    orderBy: input.orderBy ?? null,
    limit: input.limit ?? null,
    rowCount: summary.rowCount,
    newestMessageId: summary.newestMessageId,
    newestCreatedAt: summary.newestCreatedAt,
    newest10: summary.newest10,
    extra: input.extra,
  };
  state.stages.push(entry);

  if (input.stage.includes("database") || input.stage.includes("Supabase")) {
    state.databaseNewestId = summary.newestMessageId;
  }
  if (input.stage.includes("ReactQuery")) {
    state.reactQueryNewestId = summary.newestMessageId;
  }
  if (input.stage.includes("RenderedTranscript")) {
    state.renderedNewestId = summary.newestMessageId;
  }

  compareDivergence(state);

  console.info(RT, input.stage, {
    conversationId,
    queryKey: input.queryKey ?? null,
    sqlWhere: input.sqlWhere ?? null,
    orderBy: input.orderBy ?? null,
    limit: input.limit ?? null,
    rowCount: summary.rowCount,
    newestMessageId: summary.newestMessageId,
    newestCreatedAt: summary.newestCreatedAt,
    newest10: summary.newest10,
    extra: input.extra ?? null,
  });

  return entry;
}

function compareDivergence(state: NonNullable<typeof window.__OMNI_TRANSCRIPT_MSG_AUDIT__>) {
  if (state.firstDivergence) return;
  const db = state.databaseNewestId;
  const rq = state.reactQueryNewestId;
  const rendered = state.renderedNewestId;

  if (db && rq && db !== rq) {
    state.firstDivergence = {
      stage: "React Query cache vs database",
      file: "use-conversation-messages.ts",
      function: "useConversationMessages",
      line: 11,
      reason: "React Query newest message id differs from database newest",
      databaseNewestId: db,
      stageNewestId: rq,
    };
  } else if (rq && rendered && rq !== rendered) {
    state.firstDivergence = {
      stage: "Rendered transcript vs React Query",
      file: "transcript-view.tsx",
      function: "TranscriptView",
      line: 101,
      reason: "Rendered transcript newest message id differs from React Query cache",
      databaseNewestId: rq,
      stageNewestId: rendered,
    };
  } else if (db && rendered && !rq && db !== rendered) {
    state.firstDivergence = {
      stage: "Rendered transcript vs database",
      file: "transcript-view.tsx",
      function: "TranscriptView",
      line: 101,
      reason: "Rendered transcript newest message id differs from database",
      databaseNewestId: db,
      stageNewestId: rendered,
    };
  }

  if (state.firstDivergence) {
    console.info(RT, "FIRST_DIVERGENCE", state.firstDivergence);
  }
}

export function auditTranscriptMessagesFromRecords(
  conversationId: string,
  rows: Array<{ id: string; created_at: string; message_type?: string; content?: string }>,
  input: {
    stage: string;
    file: string;
    function: string;
    line: number;
    queryKey?: unknown;
    sqlWhere?: string | null;
    orderBy?: string | null;
    limit?: number | null;
    extra?: Record<string, unknown>;
  },
) {
  return traceTranscriptMessageStage({
    ...input,
    conversationId,
    rows,
  });
}

if (typeof window !== "undefined") {
  window.__traceTranscriptMessageStage__ = traceTranscriptMessageStage;
}
