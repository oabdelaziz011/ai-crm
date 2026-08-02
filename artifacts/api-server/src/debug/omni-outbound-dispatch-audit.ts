import type { Request } from "express";

const RT = "[OMNI_OUTBOUND_400]";
const TARGET_PATH = "/omnichannel/outbound/dispatch";

export type Outbound400ValidationStep = {
  validationName: string;
  layer: string;
  file: string;
  function: string;
  line: number;
  enteredAt: string;
  exitedAt: string | null;
  passed: boolean | null;
  failed: boolean | null;
  requestPayload: unknown;
  responseBody: unknown;
  error: string | null;
  stack: string | null;
};

export type Outbound400FirstStop = {
  validationName: string;
  layer: string;
  file: string;
  function: string;
  line: number;
  responseBody: unknown;
  error: string | null;
  stack: string | null;
  rootCause: string;
};

export type Outbound400AuditState = {
  path: string;
  requestId: string | null;
  startedAt: string;
  requestPayload: unknown;
  validations: Outbound400ValidationStep[];
  first400: Outbound400FirstStop | null;
  routeHandler: string | null;
  service: string | null;
  dispatcher: string | null;
  whatsAppProvider: string | null;
  metaGraphFailure: unknown;
  metaGraphStages: unknown[];
};

declare global {
  // eslint-disable-next-line no-var
  var __OMNI_OUTBOUND_400_AUDIT__: Outbound400AuditState | undefined;
  // eslint-disable-next-line no-var
  var __META_GRAPH_OUTBOUND_AUDIT__:
    | {
        path: string;
        startedAt: string;
        stages: unknown[];
        metaGraphFailure: unknown;
      }
    | undefined;
}

function captureStack(skipFrames = 2): string {
  const stack = new Error().stack ?? "";
  return stack.split("\n").slice(skipFrames).join("\n");
}

function ensureState(): Outbound400AuditState {
  if (!globalThis.__OMNI_OUTBOUND_400_AUDIT__) {
    globalThis.__OMNI_OUTBOUND_400_AUDIT__ = {
      path: TARGET_PATH,
      requestId: null,
      startedAt: new Date().toISOString(),
      requestPayload: null,
      validations: [],
      first400: null,
      routeHandler: null,
      service: null,
      dispatcher: null,
      whatsAppProvider: null,
      metaGraphFailure: null,
      metaGraphStages: [],
    };
  }
  return globalThis.__OMNI_OUTBOUND_400_AUDIT__;
}

export function isOutboundDispatchPath(req: Request): boolean {
  return (
    req.method === "POST"
    && (
      req.path === TARGET_PATH
      || req.path === `/api${TARGET_PATH}`
      || req.originalUrl?.includes(TARGET_PATH)
    )
  );
}

function syncMetaGraphAudit(state: Outbound400AuditState): void {
  const meta = globalThis.__META_GRAPH_OUTBOUND_AUDIT__;
  state.metaGraphFailure = meta?.metaGraphFailure ?? null;
  state.metaGraphStages = meta?.stages ?? [];
}

export function beginOutbound400Audit(req: Request): void {
  globalThis.__META_GRAPH_OUTBOUND_AUDIT__ = {
    path: req.originalUrl ?? `/api${TARGET_PATH}`,
    startedAt: new Date().toISOString(),
    stages: [],
    metaGraphFailure: null,
  };

  globalThis.__OMNI_OUTBOUND_400_AUDIT__ = {
    path: req.originalUrl ?? `/api${TARGET_PATH}`,
    requestId: req.requestId ?? null,
    startedAt: new Date().toISOString(),
    requestPayload: req.body ?? null,
    validations: [],
    first400: null,
    routeHandler: "omnichannel.ts POST /api/omnichannel/outbound/dispatch",
    service: "omnichannel-outbound-dispatch.ts dispatchOmnichannelOutboundMessage",
    dispatcher: "ChannelDispatcher.dispatch → OutboundMessagePipeline.process",
    whatsAppProvider: "WhatsAppCloudAdapter.sendOutbound → WhatsAppApiClient.sendMessage",
    metaGraphFailure: null,
    metaGraphStages: [],
  };
  console.info(RT, "audit.start", {
    path: req.originalUrl ?? `/api${TARGET_PATH}`,
    requestId: req.requestId ?? null,
    payload: req.body ?? null,
  });
}

export function enterOutboundValidation(input: {
  validationName: string;
  layer: string;
  file: string;
  function: string;
  line: number;
  requestPayload?: unknown;
}): Outbound400ValidationStep {
  const state = ensureState();
  const step: Outbound400ValidationStep = {
    validationName: input.validationName,
    layer: input.layer,
    file: input.file,
    function: input.function,
    line: input.line,
    enteredAt: new Date().toISOString(),
    exitedAt: null,
    passed: null,
    failed: null,
    requestPayload: input.requestPayload ?? state.requestPayload ?? null,
    responseBody: null,
    error: null,
    stack: null,
  };
  state.validations.push(step);
  console.info(RT, "validation.entered", {
    validationName: step.validationName,
    layer: step.layer,
    file: step.file,
    function: step.function,
    line: step.line,
    requestPayload: step.requestPayload,
  });
  return step;
}

export function passOutboundValidation(validationName: string, extra?: Record<string, unknown>): void {
  const state = ensureState();
  const step = [...state.validations].reverse().find(
    (item) => item.validationName === validationName && item.exitedAt === null,
  );
  if (!step) return;
  step.exitedAt = new Date().toISOString();
  step.passed = true;
  step.failed = false;
  console.info(RT, "validation.passed", {
    validationName,
    layer: step.layer,
    file: step.file,
    function: step.function,
    line: step.line,
    extra,
  });
}

export function failOutboundValidation(input: {
  validationName: string;
  file: string;
  function: string;
  line: number;
  error: string;
  responseBody: unknown;
  rootCause: string;
  layer?: string;
}): never {
  const state = ensureState();
  const step = [...state.validations].reverse().find(
    (item) => item.validationName === input.validationName && item.exitedAt === null,
  ) ?? enterOutboundValidation({
    validationName: input.validationName,
    layer: input.layer ?? "unknown",
    file: input.file,
    function: input.function,
    line: input.line,
  });

  const stack = captureStack(2);
  step.exitedAt = new Date().toISOString();
  step.passed = false;
  step.failed = true;
  step.error = input.error;
  step.responseBody = input.responseBody;
  step.stack = stack;

  if (!state.first400) {
    state.first400 = {
      validationName: input.validationName,
      layer: step.layer,
      file: input.file,
      function: input.function,
      line: input.line,
      responseBody: input.responseBody,
      error: input.error,
      stack,
      rootCause: input.rootCause,
    };
    console.info(RT, "FIRST_400", state.first400);
  }

  console.info(RT, "validation.failed", {
    validationName: input.validationName,
    layer: step.layer,
    file: input.file,
    function: input.function,
    line: input.line,
    error: input.error,
    responseBody: input.responseBody,
    stack,
  });

  const err = new Error(input.error);
  err.name = "Outbound400ValidationError";
  throw err;
}

export function recordOutbound400FromHttpError(input: {
  statusCode: number;
  file: string;
  function: string;
  line: number;
  code?: string;
  message: string;
  validationName: string;
  layer: string;
  rootCause: string;
}): void {
  if (input.statusCode !== 400) return;
  const state = ensureState();
  const responseBody = {
    error: input.code ?? "validation_error",
    message: input.message,
    requestId: state.requestId,
  };
  const stack = captureStack(2);

  enterOutboundValidation({
    validationName: input.validationName,
    layer: input.layer,
    file: input.file,
    function: input.function,
    line: input.line,
  });

  const step = state.validations[state.validations.length - 1];
  step.exitedAt = new Date().toISOString();
  step.passed = false;
  step.failed = true;
  step.error = input.message;
  step.responseBody = responseBody;
  step.stack = stack;

  if (!state.first400) {
    state.first400 = {
      validationName: input.validationName,
      layer: input.layer,
      file: input.file,
      function: input.function,
      line: input.line,
      responseBody,
      error: input.message,
      stack,
      rootCause: input.rootCause,
    };
    console.info(RT, "FIRST_400", state.first400);
  }

  console.info(RT, "validation.failed", {
    validationName: input.validationName,
    file: input.file,
    function: input.function,
    line: input.line,
    error: input.message,
    responseBody,
    stack,
  });
}

export function logOutbound400Response(input: {
  statusCode: number;
  responseBody: unknown;
  file: string;
  function: string;
  line: number;
}): void {
  if (input.statusCode !== 400) return;
  const audit = globalThis.__OMNI_OUTBOUND_400_AUDIT__;
  if (audit) syncMetaGraphAudit(audit);
  console.info(RT, "response.400", {
    file: input.file,
    function: input.function,
    line: input.line,
    responseBody: input.responseBody,
    metaGraphFailure: globalThis.__META_GRAPH_OUTBOUND_AUDIT__?.metaGraphFailure ?? null,
    metaGraphRawResponseBody:
      (globalThis.__META_GRAPH_OUTBOUND_AUDIT__?.metaGraphFailure as { httpResponseBody?: unknown } | undefined)
        ?.httpResponseBody ?? null,
    audit: audit ?? null,
  });
}

type OutboundValidationTracer = typeof enterOutboundValidation;
type OutboundPassTracer = typeof passOutboundValidation;
type OutboundFailTracer = typeof failOutboundValidation;

declare global {
  // eslint-disable-next-line no-var
  var __traceOutboundValidationEnter__: OutboundValidationTracer | undefined;
  // eslint-disable-next-line no-var
  var __traceOutboundValidationPass__: OutboundPassTracer | undefined;
  // eslint-disable-next-line no-var
  var __traceOutboundValidationFail__: OutboundFailTracer | undefined;
}

globalThis.__traceOutboundValidationEnter__ = enterOutboundValidation;
globalThis.__traceOutboundValidationPass__ = passOutboundValidation;
globalThis.__traceOutboundValidationFail__ = failOutboundValidation;
