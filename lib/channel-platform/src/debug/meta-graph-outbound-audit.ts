const RT = "[META_GRAPH_OUTBOUND]";

export type MetaGraphOutboundStage = {
  stage: string;
  layer: string;
  file: string;
  function: string;
  line: number;
  enteredAt: string;
  extra?: Record<string, unknown>;
};

export type MetaGraphErrorFields = {
  code: number | null;
  type: string | null;
  error_subcode: number | null;
  message: string | null;
  error_user_msg: string | null;
  fbtrace_id: string | null;
  [key: string]: unknown;
};

export type MetaGraphOutboundFailure = {
  at: string;
  file: string;
  function: string;
  line: number;
  httpStatus: number;
  httpResponseBody: unknown;
  metaError: MetaGraphErrorFields | null;
  endpoint: string;
  phoneNumberId: string;
  graphApiVersion: string;
  accessTokenPresent: boolean;
  companyChannelId: string | null;
  companyId: string | null;
  mappedValidationMessage: string | null;
};

export type MetaGraphOutboundAuditState = {
  path: string;
  startedAt: string;
  stages: MetaGraphOutboundStage[];
  metaGraphFailure: MetaGraphOutboundFailure | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __META_GRAPH_OUTBOUND_AUDIT__: MetaGraphOutboundAuditState | undefined;
}

function ensureState(): MetaGraphOutboundAuditState {
  if (!globalThis.__META_GRAPH_OUTBOUND_AUDIT__) {
    globalThis.__META_GRAPH_OUTBOUND_AUDIT__ = {
      path: "/api/omnichannel/outbound/dispatch",
      startedAt: new Date().toISOString(),
      stages: [],
      metaGraphFailure: null,
    };
  }
  return globalThis.__META_GRAPH_OUTBOUND_AUDIT__;
}

export function resetMetaGraphOutboundAudit(path = "/api/omnichannel/outbound/dispatch"): void {
  globalThis.__META_GRAPH_OUTBOUND_AUDIT__ = {
    path,
    startedAt: new Date().toISOString(),
    stages: [],
    metaGraphFailure: null,
  };
}

export function traceMetaGraphOutboundStage(input: {
  stage: string;
  layer: string;
  file: string;
  function: string;
  line: number;
  extra?: Record<string, unknown>;
}): void {
  const state = ensureState();
  const entry: MetaGraphOutboundStage = {
    stage: input.stage,
    layer: input.layer,
    file: input.file,
    function: input.function,
    line: input.line,
    enteredAt: new Date().toISOString(),
    extra: input.extra,
  };
  state.stages.push(entry);
  console.info(RT, "stage", entry.stage, {
    layer: entry.layer,
    file: entry.file,
    function: entry.function,
    line: entry.line,
    extra: entry.extra,
  });
}

function readMetaError(raw: unknown): MetaGraphErrorFields | null {
  if (!raw || typeof raw !== "object") return null;
  const error = (raw as { error?: Record<string, unknown> }).error;
  if (!error || typeof error !== "object") return null;
  return {
    code: typeof error.code === "number" ? error.code : null,
    type: typeof error.type === "string" ? error.type : null,
    error_subcode: typeof error.error_subcode === "number" ? error.error_subcode : null,
    message: typeof error.message === "string" ? error.message : null,
    error_user_msg: typeof error.error_user_msg === "string" ? error.error_user_msg : null,
    fbtrace_id: typeof error.fbtrace_id === "string" ? error.fbtrace_id : null,
    ...error,
  };
}

export function recordMetaGraphOutboundFailure(input: {
  file: string;
  function: string;
  line: number;
  httpStatus: number;
  httpResponseBody: unknown;
  endpoint: string;
  phoneNumberId: string;
  graphApiVersion: string;
  accessTokenPresent: boolean;
  companyChannelId?: string | null;
  companyId?: string | null;
  mappedValidationMessage?: string | null;
}): MetaGraphOutboundFailure {
  const state = ensureState();
  const failure: MetaGraphOutboundFailure = {
    at: new Date().toISOString(),
    file: input.file,
    function: input.function,
    line: input.line,
    httpStatus: input.httpStatus,
    httpResponseBody: input.httpResponseBody,
    metaError: readMetaError(input.httpResponseBody),
    endpoint: input.endpoint,
    phoneNumberId: input.phoneNumberId,
    graphApiVersion: input.graphApiVersion,
    accessTokenPresent: input.accessTokenPresent,
    companyChannelId: input.companyChannelId ?? null,
    companyId: input.companyId ?? null,
    mappedValidationMessage: input.mappedValidationMessage ?? null,
  };
  state.metaGraphFailure = failure;

  console.info(RT, "GRAPH_RESPONSE_NOT_OK", {
    httpStatus: failure.httpStatus,
    httpResponseBody: failure.httpResponseBody,
    metaErrorCode: failure.metaError?.code ?? null,
    metaErrorType: failure.metaError?.type ?? null,
    metaErrorSubcode: failure.metaError?.error_subcode ?? null,
    metaErrorMessage: failure.metaError?.message ?? null,
    metaErrorFbtraceId: failure.metaError?.fbtrace_id ?? null,
    phoneNumberId: failure.phoneNumberId,
    graphApiVersion: failure.graphApiVersion,
    accessTokenPresent: failure.accessTokenPresent,
    companyChannelId: failure.companyChannelId,
    companyId: failure.companyId,
    endpoint: failure.endpoint,
    mappedValidationMessage: failure.mappedValidationMessage,
  });

  return failure;
}

export function getMetaGraphOutboundAudit(): MetaGraphOutboundAuditState | null {
  return globalThis.__META_GRAPH_OUTBOUND_AUDIT__ ?? null;
}
