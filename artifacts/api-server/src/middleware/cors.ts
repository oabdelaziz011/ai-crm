import type { NextFunction, Request, Response } from "express";
import { PUBLIC_WEB_CHAT_ROUTE_PREFIX } from "../services/public-web-chat/public-web-chat-config.js";

/** Browser origins always permitted to call authenticated /api/* with credentials. */
export const API_CORS_DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://valueor.org",
  "https://app.valueor.org",
] as const;

/** Built-in allowlist (env extras are merged at request time via resolveApiCorsAllowedOrigins). */
export const API_CORS_ALLOWED_ORIGINS = API_CORS_DEFAULT_ORIGINS;

const ALLOWED_METHODS = "GET,POST,OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type";

export function normalizeCorsOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

export function parseCorsOriginList(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((value) => normalizeCorsOrigin(value))
    .filter((value) => value.length > 0);
}

export function resolveApiCorsAllowedOrigins(
  env: NodeJS.Dict<string> | NodeJS.ProcessEnv = process.env,
): string[] {
  const extra = [
    ...parseCorsOriginList(env.CORS_ALLOWED_ORIGINS),
    ...parseCorsOriginList(env.FRONTEND_ORIGIN),
    ...parseCorsOriginList(env.VITE_APP_ORIGIN),
  ];
  const merged = [...API_CORS_DEFAULT_ORIGINS, ...extra].map(normalizeCorsOrigin);
  return [...new Set(merged.filter((value) => value.length > 0))];
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowed: readonly string[] = resolveApiCorsAllowedOrigins(),
): origin is string {
  if (!origin?.trim()) return false;
  return allowed.includes(normalizeCorsOrigin(origin));
}

function requestPath(req: Request): string {
  const raw = req.originalUrl || req.url || req.path || "";
  return raw.split("?")[0] || "";
}

/** Public Web Chat owns its CORS (per-widget allowlist, no credentials). */
export function isPublicWebChatPath(path: string): boolean {
  return path === PUBLIC_WEB_CHAT_ROUTE_PREFIX || path.startsWith(`${PUBLIC_WEB_CHAT_ROUTE_PREFIX}/`);
}

function isApiRequest(req: Request): boolean {
  const path = requestPath(req);
  if (isPublicWebChatPath(path)) return false;
  return path === "/api" || path.startsWith("/api/");
}

export function applyApiCorsHeaders(req: Request, res: Response): boolean {
  if (!isApiRequest(req)) return false;

  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");

  const origin = req.header("origin") ?? undefined;
  if (isAllowedCorsOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", normalizeCorsOrigin(origin));
    res.setHeader("Access-Control-Allow-Credentials", "true");
    return true;
  }

  return false;
}

/**
 * Global CORS for /api/* — credentials-aware allowlist (never "*").
 * OPTIONS preflight always ends with 204 for /api so auth/rate-limit never block it.
 */
export function apiCorsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isApiRequest(req)) {
    next();
    return;
  }

  applyApiCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.setHeader("Cache-Control", "no-store");
    res.status(204).end();
    return;
  }

  next();
}
