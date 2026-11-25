import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { HttpError } from "../middleware/error-handler.js";

export const INSTAGRAM_HEALTH_DIAG_STAGES = [
  "supabase_auth",
  "company_scope",
  "channel_lookup",
  "credentials_load",
  "meta_health",
] as const;

export type InstagramHealthDiagStage = (typeof INSTAGRAM_HEALTH_DIAG_STAGES)[number];

export type InstagramHealthDiagEvent = "start" | "end" | "error";

export type InstagramHealthDiagCompletion =
  | "next"
  | "next_error"
  | "response_finished"
  | "response_closed"
  | "thrown"
  | "async";

export type InstagramHealthDiagLogFields = {
  instagramHealthDiag: true;
  requestId: string | undefined;
  correlationId: string | undefined;
  stage: InstagramHealthDiagStage;
  event: InstagramHealthDiagEvent;
  durationMs?: number;
  completion?: InstagramHealthDiagCompletion;
  statusCode?: number;
  errorCode?: string;
  errorName?: string;
  hasAuthorization?: boolean;
};

type ExpressMiddleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

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

export function normalizeInstagramHealthDiagKey(key: string): string {
  return key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

export function isSensitiveInstagramHealthDiagKey(key: string): boolean {
  const normalized = normalizeInstagramHealthDiagKey(key);
  if (normalized === "hasauthorization") return false;
  if (SENSITIVE_KEY_NORMALIZED.has(normalized)) return true;
  return /(secret|token|password|apikey)$/i.test(normalized);
}

export function isSensitiveInstagramHealthDiagValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERN.test(value);
}

function sanitizeInstagramHealthDiagValue(value: unknown, depth: number): unknown {
  if (depth > MAX_SANITIZE_DEPTH) return REDACTED;
  if (typeof value === "string") {
    return isSensitiveInstagramHealthDiagValue(value) ? REDACTED : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeInstagramHealthDiagValue(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    return sanitizeInstagramHealthDiagObject(value as Record<string, unknown>, depth + 1);
  }
  return value;
}

function sanitizeInstagramHealthDiagObject(
  fields: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isSensitiveInstagramHealthDiagKey(key)) continue;
    out[key] = sanitizeInstagramHealthDiagValue(value, depth);
  }
  return out;
}

export function isInstagramOutboundHealthPath(req: Pick<Request, "originalUrl" | "url" | "path">): boolean {
  const path = (req.originalUrl || req.url || req.path || "").split("?")[0] ?? "";
  return path.endsWith("/instagram/channel-outbound-health");
}

export function shouldInstrumentInstagramHealthDiag(req: Request): boolean {
  return isInstagramOutboundHealthPath(req) && req.method !== "OPTIONS";
}

/** Deep-sanitize diag payloads (nested objects/arrays) so secrets cannot reach logs. */
export function sanitizeInstagramHealthDiagFields(
  fields: Record<string, unknown>,
): InstagramHealthDiagLogFields {
  return sanitizeInstagramHealthDiagObject(fields, 0) as InstagramHealthDiagLogFields;
}

export function buildInstagramHealthDiagFields(input: {
  req: Pick<Request, "requestId" | "correlationId"> & { header?: Request["header"] };
  stage: InstagramHealthDiagStage;
  event: InstagramHealthDiagEvent;
  durationMs?: number;
  completion?: InstagramHealthDiagCompletion;
  statusCode?: number;
  error?: unknown;
  hasAuthorization?: boolean;
}): InstagramHealthDiagLogFields {
  const fields: Record<string, unknown> = {
    instagramHealthDiag: true,
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
    if (typeof record.name === "string" && !isSensitiveInstagramHealthDiagKey(record.name)) {
      fields.errorName = record.name;
    } else {
      fields.errorName = "Error";
    }
    if (typeof record.code === "string" && !isSensitiveInstagramHealthDiagKey(record.code)) {
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

  return sanitizeInstagramHealthDiagFields(fields);
}

export function logInstagramHealthStage(
  fields: InstagramHealthDiagLogFields,
  message = "instagram.channel-outbound-health stage",
): void {
  const safe = sanitizeInstagramHealthDiagFields(fields as unknown as Record<string, unknown>);
  logger.info(safe, message);
}

export type InstagramHealthDiagLogFn = (
  fields: InstagramHealthDiagLogFields,
  message?: string,
) => void;

/**
 * Time shared middleware only for the Instagram health path.
 * Settles exactly once via next(), next(err), res finish, or premature close.
 */
export function wrapInstagramHealthMiddleware(
  stage: InstagramHealthDiagStage,
  middleware: ExpressMiddleware,
  logFn: InstagramHealthDiagLogFn = logInstagramHealthStage,
): ExpressMiddleware {
  return (req, res, next) => {
    if (!shouldInstrumentInstagramHealthDiag(req)) {
      return middleware(req, res, next);
    }

    const started = performance.now();
    let settled = false;

    const settle = (
      event: "end" | "error",
      completion: InstagramHealthDiagCompletion,
      error?: unknown,
    ): void => {
      if (settled) return;
      settled = true;
      res.removeListener("finish", onFinish);
      res.removeListener("close", onClose);
      logFn(
        buildInstagramHealthDiagFields({
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
      buildInstagramHealthDiagFields({
        req,
        stage,
        event: "start",
        hasAuthorization: Boolean(req.header("authorization")),
      }),
    );

    const wrappedNext: NextFunction = ((error?: unknown) => {
      if (error !== undefined && error !== null) {
        settle("error", "next_error", error);
        next(error);
        return;
      }
      settle("end", "next");
      next();
    }) as NextFunction;

    try {
      const result = middleware(req, res, wrappedNext);
      if (result && typeof (result as Promise<void>).then === "function") {
        void (result as Promise<void>).catch((error: unknown) => {
          if (settled) return;
          settle("error", "thrown", error);
          next(error);
        });
      }
    } catch (error) {
      settle("error", "thrown", error);
      next(error);
    }
  };
}

/** Time an async stage inside the Instagram health handler (exactly one end or error). */
export async function timeInstagramHealthStage<T>(
  req: Request,
  stage: InstagramHealthDiagStage,
  work: () => Promise<T>,
  logFn: InstagramHealthDiagLogFn = logInstagramHealthStage,
): Promise<T> {
  if (!shouldInstrumentInstagramHealthDiag(req)) {
    return work();
  }

  const started = performance.now();
  logFn(
    buildInstagramHealthDiagFields({
      req,
      stage,
      event: "start",
      hasAuthorization: Boolean(req.header("authorization")),
    }),
  );

  try {
    const value = await work();
    logFn(
      buildInstagramHealthDiagFields({
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
      buildInstagramHealthDiagFields({
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
