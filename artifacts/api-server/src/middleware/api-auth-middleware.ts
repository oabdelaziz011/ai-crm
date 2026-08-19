import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import type { ApiAuthContext } from "@login-app/lib/integration/types/integration-types";
import type { ApiCallsCommercialPort } from "../lib/quota/api-calls-commercial-adapter.js";

declare global {
  namespace Express {
    interface Request {
      apiAuth?: ApiAuthContext;
    }
  }
}

export type ApiAuthMiddlewareDeps = {
  apiCallsCommercial: ApiCallsCommercialPort;
  authenticateBearer: (token: string, ip?: string) => Promise<ApiAuthContext | null>;
  isApiAccessEntitled: (companyId: string) => Promise<boolean>;
  checkRateLimit: (ctx: ApiAuthContext) => boolean;
};

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string") return apiKey;
  return null;
}

export function createApiAuthMiddleware(deps: ApiAuthMiddlewareDeps) {
  return async function apiAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing API key or bearer token" } });
      return;
    }

    try {
      const ip =
        typeof req.headers["x-forwarded-for"] === "string"
          ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
          : req.ip;
      const ctx = await deps.authenticateBearer(token, ip);
      if (!ctx) {
        res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired credentials" } });
        return;
      }

      const entitled = await deps.isApiAccessEntitled(ctx.companyId);
      if (!entitled) {
        res.status(403).json({
          error: {
            code: "FEATURE_NOT_ENTITLED",
            message: "API access is not entitled for this company",
            featureCode: "api_access",
          },
        });
        return;
      }

      if (!deps.checkRateLimit(ctx)) {
        res.status(429).json({ error: { code: "RATE_LIMITED", message: "Rate limit exceeded" } });
        return;
      }

      const quota = await deps.apiCallsCommercial.checkQuota({ companyId: ctx.companyId });
      if (!quota.allowed) {
        if (quota.reason === "quota_exceeded") {
          res.status(403).json({
            error: {
              code: "QUOTA_EXCEEDED",
              message: "API call quota exceeded for this company",
              featureCode: "api_access",
            },
          });
          return;
        }

        res.status(503).json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Commercial quota could not be verified",
          },
        });
        return;
      }

      req.apiAuth = ctx;

      try {
        await deps.apiCallsCommercial.recordUsage({
          companyId: ctx.companyId,
          requestId: req.requestId ?? req.correlationId ?? randomUUID(),
          method: req.method,
          path: req.path,
        });
      } catch {
        // Best-effort metering — failure must not break API dispatch (mirrors AI Email Routing).
      }

      next();
    } catch (err) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) },
      });
    }
  };
}
