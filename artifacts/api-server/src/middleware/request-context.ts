import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      correlationId?: string;
      startTimeMs?: number;
    }
  }
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingRequestId = req.header("x-request-id");
  const incomingCorrelationId = req.header("x-correlation-id");

  req.requestId = incomingRequestId?.trim() || randomUUID();
  req.correlationId = incomingCorrelationId?.trim() || req.requestId;
  req.startTimeMs = performance.now();

  res.setHeader("x-request-id", req.requestId);
  res.setHeader("x-correlation-id", req.correlationId);

  next();
}
