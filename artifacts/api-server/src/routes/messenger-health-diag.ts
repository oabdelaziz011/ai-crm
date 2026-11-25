import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { applyApiCorsHeaders } from "../middleware/cors.js";
import { HttpError } from "../middleware/error-handler.js";

export const MESSENGER_HEALTH_DIAG_STAGES = [
  "supabase_auth",
  "company_scope",
  "channel_lookup",
  "credentials_load",
  "meta_health",
  "request_deadline",
] as const;

export type MessengerHealthDiagStage = (typeof MESSENGER_HEALTH_DIAG_STAGES)[number];

export type MessengerHealthDiagEvent = "start" | "end" | "error";

export type MessengerHealthDiagCompletion =
  | "next"
  | "next_error"
  | "response_finished"
  | "response_closed"
  | "thrown"
  | "async";

export type MessengerHealthDiagLogFields = {
  messengerHealthDiag: true;
  requestId: string | undefined;
  correlationId: string | undefined;
  stage: MessengerHealthDiagStage;
  event: MessengerHealthDiagEvent;
  durationMs?: number;
  completion?: MessengerHealthDiagCompletion;
  statusCode?: number;
  errorCode?: string;
  errorName?: string;
  hasAuthorization?: boolean;
};

type ExpressMiddleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/**
 * Per-stage budget for auth/scope/channel/credentials on the Messenger health path only.
 * Must stay under live Nginx/Cloudflare proxy budgets so Express can still return JSON+CORS
 * instead of an origin 502 with no Access-Control-Allow-Origin (browser "Failed to fetch").
 */
export const MESSENGER_HEALTH_PRE_META_STAGE_TIMEOUT_MS = 10_000;

/**
 * Absolute ceiling for the whole Messenger health POST (auth → Meta).
 * Must remain below Nginx/Cloudflare proxy_read budgets (~60–100s) with margin.
 * On expiry we write JSON+CORS directly (do not rely on next(err) while auth may still hang).
 */
export const MESSENGER_HEALTH_HARD_DEADLINE_MS = 45_000;

export function createMessengerHealthStageTimeoutError(stage: MessengerHealthDiagStage): HttpError {
  return new HttpError(
    504,
    `Messenger health stage "${stage}" timed out before completion.`,
    "messenger_health_stage_timeout",
  );
}

/** Write a CORS-safe JSON 504 for the Messenger health path; no-ops if headers already sent. */
export function sendMessengerHealthTimeoutResponse(
  req: Request,
  res: Response,
  input: {
    stage: MessengerHealthDiagStage;
    code: string;
    message: string;
    durationMs?: number;
    logFn?: MessengerHealthDiagLogFn;
  },
): boolean {
  if (res.headersSent || res.writableEnded) return false;
  applyApiCorsHeaders(req, res);
  input.logFn?.(
    buildMessengerHealthDiagFields({
      req,
      stage: input.stage,
      event: "error",
      durationMs: input.durationMs,
      completion: "next_error",
      statusCode: 504,
      error: new HttpError(504, input.message, input.code),
      hasAuthorization: Boolean(req.header("authorization")),
    }),
  );
  res.status(504).json({
    error: input.code,
    message: input.message,
    stage: input.stage,
    requestId: req.requestId,
    correlationId: req.correlationId,
  });
  return true;
}

export async function withMessengerHealthTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const SENSITIVE_KEY_NORMALIZED = new Set([
  "authorization",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "clientsecret",
  "appsecret",
  "apikey",
  "apisecret",
  "secret",
  "secretkey",
  "privatekey",
  "password",
  "cookie",
  "token",
  "authtoken",
  "bearertoken",
  "verifytoken",
  "webhookverifytoken",
  "sessiontoken",
]);

/** JWT, Meta EAAG*, sk_live/sk_test, Bearer creds, or long opaque secrets (not dashed UUIDs). */
const SENSITIVE_VALUE_PATTERN =
  /bearer\s+\S+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|EAAG[A-Za-z0-9]{16,}|sk[_-](?:live|test)[_-][A-Za-z0-9]{8,}|(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{48,}(?![A-Za-z0-9_-])/i;

const REDACTED = "[REDACTED]";
const MAX_SANITIZE_DEPTH = 8;

export function normalizeMessengerHealthDiagKey(key: string): string {
  return key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

export function isSensitiveMessengerHealthDiagKey(key: string): boolean {
  const normalized = normalizeMessengerHealthDiagKey(key);
  if (normalized === "hasauthorization") return false;
  if (SENSITIVE_KEY_NORMALIZED.has(normalized)) return true;
  return /(secret|token|password|apikey)$/i.test(normalized);
}

export function isSensitiveMessengerHealthDiagValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERN.test(value);
}

function sanitizeMessengerHealthDiagValue(value: unknown, depth: number): unknown {
  if (depth > MAX_SANITIZE_DEPTH) return REDACTED;
  if (typeof value === "string") {
    return isSensitiveMessengerHealthDiagValue(value) ? REDACTED : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeMessengerHealthDiagValue(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    return sanitizeMessengerHealthDiagObject(value as Record<string, unknown>, depth + 1);
  }
  return value;
}

function sanitizeMessengerHealthDiagObject(
  fields: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isSensitiveMessengerHealthDiagKey(key)) continue;
    out[key] = sanitizeMessengerHealthDiagValue(value, depth);
  }
  return out;
}

export function isMessengerOutboundHealthPath(req: Pick<Request, "originalUrl" | "url" | "path">): boolean {
  const path = (req.originalUrl || req.url || req.path || "").split("?")[0] ?? "";
  return path.endsWith("/messenger/channel-outbound-health");
}

export function shouldInstrumentMessengerHealthDiag(req: Request): boolean {
  return isMessengerOutboundHealthPath(req) && req.method !== "OPTIONS";
}

/** Deep-sanitize diag payloads (nested objects/arrays) so secrets cannot reach logs. */
export function sanitizeMessengerHealthDiagFields(
  fields: Record<string, unknown>,
): MessengerHealthDiagLogFields {
  return sanitizeMessengerHealthDiagObject(fields, 0) as MessengerHealthDiagLogFields;
}

export function buildMessengerHealthDiagFields(input: {
  req: Pick<Request, "requestId" | "correlationId"> & { header?: Request["header"] };
  stage: MessengerHealthDiagStage;
  event: MessengerHealthDiagEvent;
  durationMs?: number;
  completion?: MessengerHealthDiagCompletion;
  statusCode?: number;
  error?: unknown;
  hasAuthorization?: boolean;
}): MessengerHealthDiagLogFields {
  const fields: Record<string, unknown> = {
    messengerHealthDiag: true,
    requestId: input.req.requestId,
    correlationId: input.req.correlationId,
    stage: input.stage,
    event: input.event,
  };

  if (typeof input.durationMs === "number" && Number.isFinite(input.durationMs)) {
    fields.durationMs = Math.max(0, Math.round(input.durationMs));
  }
  if (input.completion) fields.completion = input.completion;
  if (typeof input.statusCode === "number") fields.statusCode = input.statusCode;
  if (typeof input.hasAuthorization === "boolean") fields.hasAuthorization = input.hasAuthorization;

  if (input.error instanceof HttpError) {
    fields.errorCode = input.error.code ?? "http_error";
    fields.errorName = "HttpError";
    fields.statusCode = input.error.statusCode;
  } else if (input.error && typeof input.error === "object") {
    const record = input.error as { name?: unknown; code?: unknown; statusCode?: unknown };
    if (typeof record.name === "string" && !isSensitiveMessengerHealthDiagKey(record.name)) {
      fields.errorName = record.name;
    } else {
      fields.errorName = "Error";
    }
    if (typeof record.code === "string" && !isSensitiveMessengerHealthDiagKey(record.code)) {
      fields.errorCode = record.code;
    }
    if (typeof record.statusCode === "number") {
      fields.statusCode = record.statusCode;
    } else if (typeof input.statusCode === "number") {
      fields.statusCode = input.statusCode;
    }
  } else if (input.error) {
    fields.errorName = "Error";
    if (typeof input.statusCode === "number") fields.statusCode = input.statusCode;
  }

  return sanitizeMessengerHealthDiagFields(fields);
}

export function logMessengerHealthStage(
  fields: MessengerHealthDiagLogFields,
  message = "messenger.channel-outbound-health stage",
): void {
  const safe = sanitizeMessengerHealthDiagFields(fields as unknown as Record<string, unknown>);
  logger.info(safe, message);
}

export type MessengerHealthDiagLogFn = (
  fields: MessengerHealthDiagLogFields,
  message?: string,
) => void;

/**
 * Absolute request deadline for Messenger outbound health.
 * Writes JSON+CORS directly so a hung auth/await cannot leave Nginx to emit a bare 502.
 */
export function wrapMessengerHealthHardDeadline(
  logFn: MessengerHealthDiagLogFn = logMessengerHealthStage,
  options?: { deadlineMs?: number },
): ExpressMiddleware {
  const deadlineMs = options?.deadlineMs ?? MESSENGER_HEALTH_HARD_DEADLINE_MS;
  return (req, res, next) => {
    if (!shouldInstrumentMessengerHealthDiag(req) || req.method === "OPTIONS") {
      next();
      return;
    }

    const started = performance.now();
    const timer = setTimeout(() => {
      sendMessengerHealthTimeoutResponse(req, res, {
        stage: "request_deadline",
        code: "messenger_health_deadline",
        message:
          "Messenger health check exceeded the safe proxy budget before completion.",
        durationMs: performance.now() - started,
        logFn,
      });
    }, deadlineMs);

    const clear = (): void => {
      clearTimeout(timer);
    };
    res.on("finish", clear);
    res.on("close", clear);
    next();
  };
}

/**
 * Time shared middleware only for the Messenger health path.
 * Settles exactly once via next(), next(err), res finish, or premature close.
 */
export function wrapMessengerHealthMiddleware(
  stage: MessengerHealthDiagStage,
  middleware: ExpressMiddleware,
  logFn: MessengerHealthDiagLogFn = logMessengerHealthStage,
  options?: { timeoutMs?: number },
): ExpressMiddleware {
  const timeoutMs = options?.timeoutMs ?? MESSENGER_HEALTH_PRE_META_STAGE_TIMEOUT_MS;
  return (req, res, next) => {
    if (!shouldInstrumentMessengerHealthDiag(req)) {
      return middleware(req, res, next);
    }

    const started = performance.now();
    let settled = false;
    let stageTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (
      event: "end" | "error",
      completion: MessengerHealthDiagCompletion,
      error?: unknown,
    ): void => {
      if (settled) return;
      settled = true;
      if (stageTimer) clearTimeout(stageTimer);
      res.removeListener("finish", onFinish);
      res.removeListener("close", onClose);
      logFn(
        buildMessengerHealthDiagFields({
          req,
          stage,
          event,
          durationMs: performance.now() - started,
          completion,
          statusCode: res.statusCode,
          error,
          hasAuthorization: Boolean(req.header("authorization")),
        }),
      );
    };

    const onFinish = (): void => {
      settle("end", "response_finished");
    };

    const onClose = (): void => {
      if (!settled && !res.writableEnded) {
        settle("error", "response_closed");
      }
    };

    res.on("finish", onFinish);
    res.on("close", onClose);

    logFn(
      buildMessengerHealthDiagFields({
        req,
        stage,
        event: "start",
        hasAuthorization: Boolean(req.header("authorization")),
      }),
    );

    const wrappedNext: NextFunction = ((error?: unknown) => {
      // After a stage timeout we may already have written the response; never re-enter the chain.
      if (settled || res.headersSent || res.writableEnded) {
        return;
      }
      if (error !== undefined && error !== null) {
        settle("error", "next_error", error);
        next(error);
        return;
      }
      settle("end", "next");
      next();
    }) as NextFunction;

    stageTimer = setTimeout(() => {
      if (settled || res.headersSent || res.writableEnded) return;
      settled = true;
      if (stageTimer) clearTimeout(stageTimer);
      res.removeListener("finish", onFinish);
      res.removeListener("close", onClose);
      sendMessengerHealthTimeoutResponse(req, res, {
        stage,
        code: "messenger_health_stage_timeout",
        message: `Messenger health stage "${stage}" timed out before completion.`,
        durationMs: performance.now() - started,
        logFn,
      });
    }, timeoutMs);

    try {
      const result = middleware(req, res, wrappedNext);
      if (result && typeof (result as Promise<void>).then === "function") {
        void (result as Promise<void>).catch((error: unknown) => {
          if (settled || res.headersSent || res.writableEnded) return;
          settle("error", "thrown", error);
          next(error);
        });
      }
    } catch (error) {
      if (settled || res.headersSent || res.writableEnded) return;
      settle("error", "thrown", error);
      next(error);
    }
  };
}

/** Time an async stage inside the Messenger health handler (exactly one end or error). */
export async function timeMessengerHealthStage<T>(
  req: Request,
  stage: MessengerHealthDiagStage,
  work: () => Promise<T>,
  logFn: MessengerHealthDiagLogFn = logMessengerHealthStage,
  options?: { timeoutMs?: number },
): Promise<T> {
  if (!shouldInstrumentMessengerHealthDiag(req)) {
    return work();
  }

  const started = performance.now();
  logFn(
    buildMessengerHealthDiagFields({
      req,
      stage,
      event: "start",
      hasAuthorization: Boolean(req.header("authorization")),
    }),
  );

  try {
    // meta_health keeps its own Meta Graph budget in the route (20s); do not double-cap here.
    const timeoutMs = options?.timeoutMs ?? MESSENGER_HEALTH_PRE_META_STAGE_TIMEOUT_MS;
    const value =
      stage === "meta_health"
        ? await work()
        : await withMessengerHealthTimeout(work(), timeoutMs, () =>
            createMessengerHealthStageTimeoutError(stage),
          );
    logFn(
      buildMessengerHealthDiagFields({
        req,
        stage,
        event: "end",
        durationMs: performance.now() - started,
        completion: "async",
        hasAuthorization: Boolean(req.header("authorization")),
      }),
    );
    return value;
  } catch (error) {
    logFn(
      buildMessengerHealthDiagFields({
        req,
        stage,
        event: "error",
        durationMs: performance.now() - started,
        completion: "thrown",
        error,
        hasAuthorization: Boolean(req.header("authorization")),
      }),
    );
    throw error;
  }
}
