import type { NextFunction, Request, Response } from "express";

/** Browser origins permitted to call authenticated /api/* endpoints with credentials. */
export const API_CORS_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://valueor.org",
  "https://app.valueor.org",
] as const;

const ALLOWED_METHODS = "GET,POST,OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type";

function isAllowedOrigin(origin: string | undefined): origin is string {
  return Boolean(origin && (API_CORS_ALLOWED_ORIGINS as readonly string[]).includes(origin));
}

/**
 * Global CORS for /api/* — credentials-aware allowlist (never "*").
 * OPTIONS preflight always ends with 204 when the route is under /api.
 */
export function apiCorsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path || req.url?.split("?")[0] || "";
  if (!path.startsWith("/api")) {
    next();
    return;
  }

  const origin = req.header("origin") ?? undefined;
  if (isAllowedOrigin(origin)) {
    // Reflect specific origin when credentials are used — never "*".
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
