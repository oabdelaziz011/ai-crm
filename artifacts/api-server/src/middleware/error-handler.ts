import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { isOutboundDispatchPath, logOutbound400Response } from "../debug/omni-outbound-dispatch-audit.js";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: "not_found",
    message: "The requested resource was not found.",
    path: req.path,
    requestId: req.requestId,
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err instanceof HttpError ? err.statusCode : 500;
  const code = err instanceof HttpError ? err.code ?? "internal_error" : "internal_error";
  const message =
    err instanceof HttpError
      ? err.message
      : statusCode >= 500
        ? "An unexpected error occurred."
        : err instanceof Error
          ? err.message
          : "An unexpected error occurred.";

  if (statusCode >= 500) {
    logger.error(
      {
        err,
        requestId: req.requestId,
        correlationId: req.correlationId,
        method: req.method,
        path: req.path,
      },
      "Unhandled request error",
    );
  }

  if (res.headersSent) {
    return;
  }

  const responseBody = {
    error: code,
    message,
    requestId: req.requestId,
  };

  if (statusCode === 400 && isOutboundDispatchPath(req)) {
    logOutbound400Response({
      statusCode,
      responseBody,
      file: "error-handler.ts",
      function: "errorHandler",
      line: 58,
    });
  }

  res.status(statusCode).json(responseBody);
}
