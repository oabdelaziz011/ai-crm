import type { Request, Response, NextFunction } from "express";
import { getIntegrationServices, getServiceClient } from "../lib/integration-client.js";
import { createApiCallsCommercialPort } from "../lib/quota/api-calls-commercial-adapter.js";
import { createApiAuthMiddleware, type ApiAuthMiddlewareDeps } from "./api-auth-middleware.js";

export type { ApiAuthMiddlewareDeps } from "./api-auth-middleware.js";
export { createApiAuthMiddleware } from "./api-auth-middleware.js";

let testOverrides: Partial<ApiAuthMiddlewareDeps> = {};

export function setApiAuthMiddlewareDepsForTests(deps: Partial<ApiAuthMiddlewareDeps>): void {
  testOverrides = deps;
}

export function resetApiAuthMiddlewareDepsForTests(): void {
  testOverrides = {};
}

function buildProductionDeps(): ApiAuthMiddlewareDeps {
  const services = getIntegrationServices();
  return {
    authenticateBearer: (token, ip) => services.authenticateBearer(token, ip),
    isApiAccessEntitled: async (companyId) => {
      const client = getServiceClient();
      const { data, error } = await client.rpc("is_feature_enabled", {
        p_company_id: companyId,
        p_feature_code: "api_access",
      });
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    checkRateLimit: (ctx) => services.checkRateLimit(ctx),
    apiCallsCommercial: createApiCallsCommercialPort(getServiceClient()),
  };
}

function resolveDeps(): ApiAuthMiddlewareDeps {
  const base = buildProductionDeps();
  return {
    authenticateBearer: testOverrides.authenticateBearer ?? base.authenticateBearer,
    isApiAccessEntitled: testOverrides.isApiAccessEntitled ?? base.isApiAccessEntitled,
    checkRateLimit: testOverrides.checkRateLimit ?? base.checkRateLimit,
    apiCallsCommercial: testOverrides.apiCallsCommercial ?? base.apiCallsCommercial,
  };
}

export async function apiAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  return createApiAuthMiddleware(resolveDeps())(req, res, next);
}

export function requireScopes(...scopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiAuth) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
      return;
    }
    try {
      getIntegrationServices().requireScopes(
        req.apiAuth as Parameters<ReturnType<typeof getIntegrationServices>["requireScopes"]>[0],
        scopes as never[],
      );
      next();
    } catch (err) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: err instanceof Error ? err.message : String(err) } });
    }
  };
}

export function auditResponse(req: Request, res: Response, startMs: number) {
  if (!req.apiAuth) return;
  const latency = Date.now() - startMs;
  getIntegrationServices().audit(
    req.apiAuth as Parameters<ReturnType<typeof getIntegrationServices>["audit"]>[0],
    req.method,
    req.path,
    res.statusCode,
    latency,
  );
}
