import { OMNI_RENDER_TARGET_ID, OMNI_RENDER_TARGET_NUMBER } from "@/lib/omnichannel/debug/omni-render-audit";

const RT = "[OMNI_SEND]";

export type OmniSendPipelineStage = {
  runId: string;
  layer: number;
  stage: string;
  file: string;
  function: string;
  line: number;
  enteredAt: string;
  exitedAt: string | null;
  durationMs: number | null;
  success: boolean | null;
  error: string | null;
  messageId: string | null;
  conversationId: string | null;
  statusBefore: string | null;
  statusAfter: string | null;
  extra?: Record<string, unknown>;
};

export type OmniSendFirstStop = {
  runId: string;
  layer: number;
  stage: string;
  file: string;
  function: string;
  line: number;
  reason: string;
  error: string | null;
  messageId: string | null;
  conversationId: string | null;
  statusBefore: string | null;
  statusAfter: string | null;
};

declare global {
  interface Window {
    __OMNI_SEND_PIPELINE__?: {
      targetConversationId: string;
      targetConversationNumber: string;
      runs: string[];
      stages: OmniSendPipelineStage[];
      firstStop: OmniSendFirstStop | null;
      activeRunId: string | null;
    };
  }
}

let runCounter = 0;

function ensureState() {
  if (typeof window === "undefined") {
    return {
      targetConversationId: OMNI_RENDER_TARGET_ID,
      targetConversationNumber: OMNI_RENDER_TARGET_NUMBER,
      runs: [] as string[],
      stages: [] as OmniSendPipelineStage[],
      firstStop: null as OmniSendFirstStop | null,
      activeRunId: null as string | null,
    };
  }
  window.__OMNI_SEND_PIPELINE__ ??= {
    targetConversationId: OMNI_RENDER_TARGET_ID,
    targetConversationNumber: OMNI_RENDER_TARGET_NUMBER,
    runs: [],
    stages: [],
    firstStop: null,
    activeRunId: null,
  };
  return window.__OMNI_SEND_PIPELINE__;
}

export function beginOmniSendRun(input?: {
  conversationId?: string | null;
  messageId?: string | null;
  extra?: Record<string, unknown>;
}): string {
  const runId = `send-${Date.now()}-${++runCounter}`;
  const state = ensureState();
  state.activeRunId = runId;
  state.runs.push(runId);
  traceOmniSendEnter({
    runId,
    layer: 0,
    stage: "pipeline.run.start",
    file: "omni-send-pipeline-audit.ts",
    function: "beginOmniSendRun",
    line: 95,
    conversationId: input?.conversationId ?? null,
    messageId: input?.messageId ?? null,
    extra: input?.extra,
  });
  traceOmniSendExit({
    runId,
    layer: 0,
    stage: "pipeline.run.start",
    success: true,
    conversationId: input?.conversationId ?? null,
    messageId: input?.messageId ?? null,
  });
  return runId;
}

export function getActiveOmniSendRunId(): string | null {
  return ensureState().activeRunId;
}

export function traceOmniSendEnter(input: {
  runId?: string | null;
  layer: number;
  stage: string;
  file: string;
  function: string;
  line: number;
  conversationId?: string | null;
  messageId?: string | null;
  statusBefore?: string | null;
  statusAfter?: string | null;
  extra?: Record<string, unknown>;
}): OmniSendPipelineStage {
  const state = ensureState();
  const runId = input.runId ?? state.activeRunId ?? beginOmniSendRun();
  if (!state.activeRunId) state.activeRunId = runId;

  const entry: OmniSendPipelineStage = {
    runId,
    layer: input.layer,
    stage: input.stage,
    file: input.file,
    function: input.function,
    line: input.line,
    enteredAt: new Date().toISOString(),
    exitedAt: null,
    durationMs: null,
    success: null,
    error: null,
    messageId: input.messageId ?? null,
    conversationId: input.conversationId ?? null,
    statusBefore: input.statusBefore ?? null,
    statusAfter: input.statusAfter ?? null,
    extra: input.extra,
  };

  state.stages.push(entry);
  console.info(RT, "enter", entry.stage, {
    runId,
    layer: entry.layer,
    conversationId: entry.conversationId,
    messageId: entry.messageId,
    statusBefore: entry.statusBefore,
    extra: entry.extra,
  });
  return entry;
}

export function traceOmniSendExit(input: {
  runId?: string | null;
  layer: number;
  stage: string;
  success: boolean;
  error?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  statusBefore?: string | null;
  statusAfter?: string | null;
  extra?: Record<string, unknown>;
}): OmniSendPipelineStage | null {
  const state = ensureState();
  const runId = input.runId ?? state.activeRunId;
  if (!runId) return null;

  const idx = [...state.stages].reverse().findIndex(
    (stage) => stage.runId === runId && stage.stage === input.stage && stage.exitedAt === null,
  );
  if (idx < 0) return null;

  const stageIndex = state.stages.length - 1 - idx;
  const stage = state.stages[stageIndex];
  const exitedAt = new Date().toISOString();
  const durationMs = Date.parse(exitedAt) - Date.parse(stage.enteredAt);

  stage.exitedAt = exitedAt;
  stage.durationMs = durationMs;
  stage.success = input.success;
  stage.error = input.error ?? null;
  stage.messageId = input.messageId ?? stage.messageId;
  stage.conversationId = input.conversationId ?? stage.conversationId;
  stage.statusBefore = input.statusBefore ?? stage.statusBefore;
  stage.statusAfter = input.statusAfter ?? null;
  stage.extra = { ...(stage.extra ?? {}), ...(input.extra ?? {}) };

  console.info(RT, "exit", stage.stage, {
    runId,
    layer: stage.layer,
    durationMs,
    success: stage.success,
    error: stage.error,
    messageId: stage.messageId,
    conversationId: stage.conversationId,
    statusBefore: stage.statusBefore,
    statusAfter: stage.statusAfter,
    extra: stage.extra,
  });

  if (!input.success && !state.firstStop) {
    state.firstStop = {
      runId,
      layer: stage.layer,
      stage: stage.stage,
      file: stage.file,
      function: stage.function,
      line: stage.line,
      reason: input.error ?? `stage ${stage.stage} failed`,
      error: input.error ?? null,
      messageId: stage.messageId,
      conversationId: stage.conversationId,
      statusBefore: stage.statusBefore,
      statusAfter: stage.statusAfter,
    };
    console.info(RT, "FIRST_STOP", state.firstStop);
  }

  return stage;
}

export async function traceOmniSendAsync<T>(input: {
  runId?: string | null;
  layer: number;
  stage: string;
  file: string;
  function: string;
  line: number;
  conversationId?: string | null;
  messageId?: string | null;
  statusBefore?: string | null;
  extra?: Record<string, unknown>;
  run: () => Promise<T>;
  success: (result: T) => {
    messageId?: string | null;
    statusAfter?: string | null;
    extra?: Record<string, unknown>;
  };
}): Promise<T> {
  traceOmniSendEnter({
    runId: input.runId,
    layer: input.layer,
    stage: input.stage,
    file: input.file,
    function: input.function,
    line: input.line,
    conversationId: input.conversationId,
    messageId: input.messageId,
    statusBefore: input.statusBefore,
    extra: input.extra,
  });

  try {
    const result = await input.run();
    const mapped = input.success(result);
    traceOmniSendExit({
      runId: input.runId,
      layer: input.layer,
      stage: input.stage,
      success: true,
      conversationId: input.conversationId,
      messageId: mapped.messageId ?? input.messageId ?? null,
      statusBefore: input.statusBefore ?? null,
      statusAfter: mapped.statusAfter ?? null,
      extra: mapped.extra,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    traceOmniSendExit({
      runId: input.runId,
      layer: input.layer,
      stage: input.stage,
      success: false,
      error: message,
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      statusBefore: input.statusBefore ?? null,
    });
    throw error;
  }
}

export function traceOmniSendSync<T>(input: {
  runId?: string | null;
  layer: number;
  stage: string;
  file: string;
  function: string;
  line: number;
  conversationId?: string | null;
  messageId?: string | null;
  statusBefore?: string | null;
  extra?: Record<string, unknown>;
  run: () => T;
  success: (result: T) => {
    messageId?: string | null;
    statusAfter?: string | null;
    extra?: Record<string, unknown>;
  };
}): T {
  traceOmniSendEnter({
    runId: input.runId,
    layer: input.layer,
    stage: input.stage,
    file: input.file,
    function: input.function,
    line: input.line,
    conversationId: input.conversationId,
    messageId: input.messageId,
    statusBefore: input.statusBefore,
    extra: input.extra,
  });

  try {
    const result = input.run();
    const mapped = input.success(result);
    traceOmniSendExit({
      runId: input.runId,
      layer: input.layer,
      stage: input.stage,
      success: true,
      conversationId: input.conversationId,
      messageId: mapped.messageId ?? input.messageId ?? null,
      statusBefore: input.statusBefore ?? null,
      statusAfter: mapped.statusAfter ?? null,
      extra: mapped.extra,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    traceOmniSendExit({
      runId: input.runId,
      layer: input.layer,
      stage: input.stage,
      success: false,
      error: message,
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      statusBefore: input.statusBefore ?? null,
    });
    throw error;
  }
}

export function markOmniSendFirstStop(input: {
  runId?: string | null;
  layer: number;
  stage: string;
  file: string;
  function: string;
  line: number;
  reason: string;
  error?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  statusBefore?: string | null;
  statusAfter?: string | null;
}) {
  const state = ensureState();
  if (state.firstStop) return;
  const runId = input.runId ?? state.activeRunId ?? "unknown";
  state.firstStop = {
    runId,
    layer: input.layer,
    stage: input.stage,
    file: input.file,
    function: input.function,
    line: input.line,
    reason: input.reason,
    error: input.error ?? null,
    messageId: input.messageId ?? null,
    conversationId: input.conversationId ?? null,
    statusBefore: input.statusBefore ?? null,
    statusAfter: input.statusAfter ?? null,
  };
  console.info(RT, "FIRST_STOP", state.firstStop);
}

/** First open stage (entered, never exited) — pipeline stall point. */
export function detectOmniSendStall(runId?: string | null): OmniSendFirstStop | null {
  const state = ensureState();
  if (state.firstStop) return state.firstStop;
  const id = runId ?? state.activeRunId;
  if (!id) return null;

  const openStage = state.stages.find(
    (stage) => stage.runId === id && stage.exitedAt === null && stage.layer > 0,
  );
  if (!openStage) return null;

  state.firstStop = {
    runId: id,
    layer: openStage.layer,
    stage: openStage.stage,
    file: openStage.file,
    function: openStage.function,
    line: openStage.line,
    reason: `stage ${openStage.stage} entered but never exited`,
    error: null,
    messageId: openStage.messageId,
    conversationId: openStage.conversationId,
    statusBefore: openStage.statusBefore,
    statusAfter: openStage.statusAfter,
  };
  console.info(RT, "FIRST_STOP", state.firstStop);
  return state.firstStop;
}

if (typeof window !== "undefined") {
  window.__traceOmniSendAsync__ = traceOmniSendAsync;
  window.__traceOmniSendEnter__ = traceOmniSendEnter;
  window.__traceOmniSendExit__ = traceOmniSendExit;
  window.__traceOmniSendSync__ = traceOmniSendSync;
}
