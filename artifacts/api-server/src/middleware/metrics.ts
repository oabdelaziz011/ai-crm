import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

type RouteMetrics = {
  count: number;
  errors: number;
  totalMs: number;
  maxMs: number;
};

const routeMetrics = new Map<string, RouteMetrics>();

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

export function recordRouteMetric(method: string, path: string, statusCode: number, durationMs: number): void {
  const key = routeKey(method, path);
  const current = routeMetrics.get(key) ?? { count: 0, errors: 0, totalMs: 0, maxMs: 0 };
  current.count += 1;
  current.totalMs += durationMs;
  current.maxMs = Math.max(current.maxMs, durationMs);
  if (statusCode >= 500) {
    current.errors += 1;
  }
  routeMetrics.set(key, current);
}

export function getMetricsSnapshot(): Record<
  string,
  { count: number; errors: number; avgMs: number; maxMs: number; errorRate: number }
> {
  const snapshot: Record<
    string,
    { count: number; errors: number; avgMs: number; maxMs: number; errorRate: number }
  > = {};

  for (const [key, value] of routeMetrics.entries()) {
    snapshot[key] = {
      count: value.count,
      errors: value.errors,
      avgMs: value.count > 0 ? Math.round(value.totalMs / value.count) : 0,
      maxMs: Math.round(value.maxMs),
      errorRate: value.count > 0 ? Number((value.errors / value.count).toFixed(4)) : 0,
    };
  }

  return snapshot;
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on("finish", () => {
    const started = req.startTimeMs ?? performance.now();
    const durationMs = performance.now() - started;
    const path = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;

    recordRouteMetric(req.method, path, res.statusCode, durationMs);

    if (durationMs >= 2_000) {
      logger.warn(
        {
          requestId: req.requestId,
          correlationId: req.correlationId,
          method: req.method,
          path,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs),
        },
        "Slow request",
      );
    }
  });

  next();
}
