import type { NextFunction, Request, Response } from "express";
import { createClient, type User } from "@supabase/supabase-js";
import { loadPlatformEnv } from "../config/env.js";
import { HttpError } from "./error-handler.js";
import {
  enterOutboundValidation,
  isOutboundDispatchPath,
  passOutboundValidation,
  recordOutbound400FromHttpError,
} from "../debug/omni-outbound-dispatch-audit.js";

declare global {
  namespace Express {
    interface Request {
      supabaseUser?: User;
      supabaseCompanyId?: string | null;
      supabaseIsSuperAdmin?: boolean;
    }
  }
}

const env = loadPlatformEnv();

function getAuthClient() {
  const url = env.supabaseUrl;
  const key = env.supabaseServiceRoleKey;
  if (!url || !key) {
    throw new HttpError(503, "Authentication service unavailable.", "auth_unavailable");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function readBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function isInternalApiAuthorized(req: Request): boolean {
  const configuredKey = process.env.INTERNAL_API_KEY?.trim();
  if (!configuredKey) {
    return false;
  }

  const bearer = readBearerToken(req);
  const headerKey = req.header("x-internal-api-key")?.trim();
  return bearer === configuredKey || headerKey === configuredKey;
}

export async function requireSupabaseAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // Preflight must never require a bearer token (CORS handles OPTIONS globally too).
  if (req.method === "OPTIONS") {
    next();
    return;
  }

  try {
    if (isInternalApiAuthorized(req)) {
      next();
      return;
    }

    const token = readBearerToken(req);
    if (!token) {
      throw new HttpError(401, "Authentication required.", "unauthorized");
    }

    const client = getAuthClient();
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
      throw new HttpError(401, "Invalid or expired session.", "unauthorized");
    }

    const { data: profile } = await client
      .from("profiles")
      .select("company_id, is_super_admin")
      .or(`id.eq.${data.user.id},user_id.eq.${data.user.id}`)
      .maybeSingle();

    req.supabaseUser = data.user;
    req.supabaseCompanyId = profile?.company_id ?? null;
    req.supabaseIsSuperAdmin = Boolean(profile?.is_super_admin);

    next();
  } catch (error) {
    next(error);
  }
}

export function requireCompanyScope(field = "companyId") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (req.method === "OPTIONS") {
        next();
        return;
      }
      if (isInternalApiAuthorized(req)) {
        next();
        return;
      }

      const requestedCompanyId = String((req.body as Record<string, unknown> | undefined)?.[field] ?? "");
      if (isOutboundDispatchPath(req)) {
        enterOutboundValidation({
          validationName: "middleware.requireCompanyScope",
          layer: "middleware.auth",
          file: "supabase-auth.ts",
          function: "requireCompanyScope",
          line: 96,
          requestPayload: { [field]: requestedCompanyId, profileCompanyId: req.supabaseCompanyId ?? null },
        });
      }
      if (!requestedCompanyId) {
        if (isOutboundDispatchPath(req)) {
          recordOutbound400FromHttpError({
            statusCode: 400,
            validationName: "middleware.requireCompanyScope.companyIdRequired",
            layer: "middleware.auth",
            file: "supabase-auth.ts",
            function: "requireCompanyScope",
            line: 97,
            code: "validation_error",
            message: `${field} required`,
            rootCause: `${field} missing from request body before route handler`,
          });
        }
        throw new HttpError(400, `${field} required`, "validation_error");
      }
      if (isOutboundDispatchPath(req)) {
        passOutboundValidation("middleware.requireCompanyScope", { requestedCompanyId });
      }

      if (req.supabaseIsSuperAdmin) {
        next();
        return;
      }

      if (!req.supabaseCompanyId || req.supabaseCompanyId !== requestedCompanyId) {
        throw new HttpError(403, "Access denied for this company.", "forbidden");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
