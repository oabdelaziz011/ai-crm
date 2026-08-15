import type { Request, Response, NextFunction } from "express";
import { getIntegrationServices, getServiceClient } from "../lib/integration-client.js";

type ApiAuthContext = {
  companyId: string;
  authType: "api_key" | "oauth" | "service_account" | "personal_access_token";
  authId: string;
  scopes: string[];
  ipAddress?: string;
};

declare global {
  namespace Express {
    interface Request {
      apiAuth?: ApiAuthContext;
    }
  }
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string") return apiKey;
  return null;
}

async function isApiAccessEntitled(companyId: string): Promise<boolean> {
  const client = getServiceClient();
  const { data, error } = await client.rpc("is_feature_enabled", {
    p_company_id: companyId,
    p_feature_code: "api_access",
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function apiAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing API key or bearer token" } });
    return;
  }

  try {
    const services = getIntegrationServices();
    const ip = typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",")[0]?.trim() : req.ip;
    const ctx = await services.authenticateBearer(token, ip);
    if (!ctx) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired credentials" } });
      return;
    }

    const entitled = await isApiAccessEntitled(ctx.companyId);
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

    if (!services.checkRateLimit(ctx)) {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "Rate limit exceeded" } });
      return;
    }

    req.apiAuth = ctx;
    next();
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) } });
  }
}

export function requireScopes(...scopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiAuth) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
      return;
    }
    try {
      getIntegrationServices().requireScopes(req.apiAuth as Parameters<ReturnType<typeof getIntegrationServices>["requireScopes"]>[0], scopes as never[]);
      next();
    } catch (err) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: err instanceof Error ? err.message : String(err) } });
    }
  };
}

export function auditResponse(req: Request, res: Response, startMs: number) {
  if (!req.apiAuth) return;
  const latency = Date.now() - startMs;
  getIntegrationServices().audit(req.apiAuth as Parameters<ReturnType<typeof getIntegrationServices>["audit"]>[0], req.method, req.path, res.statusCode, latency);
}
