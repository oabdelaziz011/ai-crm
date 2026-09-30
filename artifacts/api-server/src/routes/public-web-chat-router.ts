import express, { Router, type NextFunction, type Request, type Response } from "express";
import { logger } from "../lib/logger.js";
import {
  isPublicWebChatApiEnabled,
  PUBLIC_WEB_CHAT_LIMITS,
  publicWebChatVisitorCopy,
} from "../services/public-web-chat/public-web-chat-config.js";
import { normalizeWebChatOrigin } from "../services/public-web-chat/public-web-chat-origin.js";
import type {
  PublicWebChatResult,
  PublicWebChatService,
} from "../services/public-web-chat/public-web-chat-service.js";

type PreflightTarget =
  | { kind: "session_create"; widgetKey: unknown }
  | { kind: "session"; sessionId: unknown };

function errorMessages(locale: unknown): Record<string, string> {
  const copy = publicWebChatVisitorCopy(locale);
  return {
    web_chat_unavailable: copy.unavailable,
    invalid_request: copy.invalidRequest,
    message_too_long: copy.messageTooLong,
    payload_too_large: copy.payloadTooLarge,
    rate_limited: copy.rateLimited,
    temporarily_unavailable: copy.unavailable,
  };
}

function readBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1]! : null;
}

function readBody(req: Request): Record<string, unknown> {
  const body = req.body as unknown;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function requestLocale(req: Request): unknown {
  const body = req.body as { locale?: unknown } | undefined;
  return body?.locale ?? req.header("accept-language");
}

function sendError(
  req: Request,
  res: Response,
  status: number,
  error: string,
  retryAfterSeconds?: number,
): void {
  if (retryAfterSeconds) res.setHeader("Retry-After", String(retryAfterSeconds));
  const messages = errorMessages(requestLocale(req));
  res.status(status).json({ error, message: messages[error] ?? messages.web_chat_unavailable });
}

/** Reflects the origin only on successful, origin-validated responses (never "*", no credentials). */
function sendResult(req: Request, res: Response, result: PublicWebChatResult): void {
  if (result.ok) {
    const origin = normalizeWebChatOrigin(req.header("origin"));
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.status(result.status).json(result.body);
    return;
  }
  sendError(req, res, result.status, result.error, result.retryAfterSeconds);
}

export function createPublicWebChatRouter(options: {
  resolveService: () => PublicWebChatService;
  isApiEnabled?: () => boolean;
}): Router {
  const router = Router();
  const apiEnabled = options.isApiEnabled ?? (() => isPublicWebChatApiEnabled());

  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin");
    if (!apiEnabled()) {
      sendError(req, res, 404, "web_chat_unavailable");
      return;
    }
    next();
  });

  const preflight = (target: (req: Request) => PreflightTarget) =>
    async (req: Request, res: Response): Promise<void> => {
      const resolved = target(req);
      const origin = await options.resolveService().preflightOrigin({ ...resolved, origin: req.header("origin") });
      if (!origin) {
        sendError(req, res, 404, "web_chat_unavailable");
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", resolved.kind === "session_create" ? "POST" : "GET, POST");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
      res.status(204).end();
    };

  router.options(
    "/:widgetKey/sessions",
    preflight((req) => ({ kind: "session_create", widgetKey: req.params.widgetKey })),
  );
  router.options(
    "/sessions/:sessionId/messages",
    preflight((req) => ({ kind: "session", sessionId: req.params.sessionId })),
  );

  router.use(express.json({ limit: PUBLIC_WEB_CHAT_LIMITS.bodyLimit, strict: true }));

  router.post("/:widgetKey/sessions", async (req, res) => {
    const result = await options.resolveService().createSession({
      widgetKey: req.params.widgetKey,
      origin: req.header("origin"),
      body: readBody(req),
      ip: req.ip,
      userAgent: req.header("user-agent"),
    });
    sendResult(req, res, result);
  });

  router.post("/sessions/:sessionId/messages", async (req, res) => {
    const result = await options.resolveService().sendMessage({
      sessionId: req.params.sessionId,
      token: readBearerToken(req),
      origin: req.header("origin"),
      body: readBody(req),
      ip: req.ip,
      requestId: req.requestId ?? null,
    });
    sendResult(req, res, result);
  });

  router.get("/sessions/:sessionId/messages", async (req, res) => {
    const result = await options.resolveService().listMessages({
      sessionId: req.params.sessionId,
      token: readBearerToken(req),
      origin: req.header("origin"),
      after: req.query.after,
      limit: req.query.limit,
      ip: req.ip,
    });
    sendResult(req, res, result);
  });

  router.use((req, res) => {
    sendError(req, res, 404, "web_chat_unavailable");
  });

  router.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const type = (error as { type?: string } | null)?.type;
    if (type === "entity.too.large") {
      sendError(req, res, 413, "payload_too_large");
      return;
    }
    if (type === "entity.parse.failed" || type === "encoding.unsupported" || type === "charset.unsupported") {
      sendError(req, res, 400, "invalid_request");
      return;
    }
    logger.error(
      { publicWebChat: true, errorName: error instanceof Error ? error.name : typeof error },
      "public web chat router error",
    );
    sendError(req, res, 503, "temporarily_unavailable");
  });

  return router;
}
