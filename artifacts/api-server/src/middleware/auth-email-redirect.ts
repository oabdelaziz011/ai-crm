import type { NextFunction, Request, Response } from "express";

/**
 * Supabase Auth emails fall back to Site URL when redirectTo is not allow-listed.
 * If Site URL was mistakenly set to the api-server (port 3000), recovery/invite
 * links land here as `/?code=...` and would otherwise 404 as JSON.
 *
 * Forward PKCE / token-hash auth payloads to the Vite app callback route.
 */
export function resolveFrontendOrigin(): string {
  const fromEnv =
    process.env.FRONTEND_ORIGIN?.trim() ||
    process.env.VITE_APP_ORIGIN?.trim() ||
    process.env.VITE_SITE_URL?.trim() ||
    "";
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return "http://localhost:5173";
}

function firstQueryValue(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].length > 0) {
    return value[0];
  }
  return null;
}

export function isAuthEmailCallbackQuery(query: Request["query"]): boolean {
  return Boolean(
    firstQueryValue(query.code) ||
      firstQueryValue(query.token_hash) ||
      firstQueryValue(query.token) ||
      firstQueryValue(query.error) ||
      firstQueryValue(query.error_code) ||
      firstQueryValue(query.type) === "recovery" ||
      firstQueryValue(query.type) === "invite" ||
      firstQueryValue(query.type) === "signup" ||
      firstQueryValue(query.type) === "magiclink",
  );
}

export function isAuthEmailErrorQuery(query: Request["query"]): boolean {
  return Boolean(firstQueryValue(query.error) || firstQueryValue(query.error_code));
}

export function buildFrontendAuthCallbackUrl(
  query: Request["query"],
  frontendOrigin = resolveFrontendOrigin(),
): string {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = firstQueryValue(raw);
    if (value) {
      params.set(key, value);
    }
  }

  const origin = frontendOrigin.replace(/\/$/, "");

  // Expired / denied recovery links should land on a page that can request a new email.
  if (isAuthEmailErrorQuery(query)) {
    return `${origin}/auth/callback?${params.toString()}`;
  }

  if (!params.get("next")?.startsWith("/")) {
    params.set("next", "/reset-password");
  }
  return `${origin}/auth/callback?${params.toString()}`;
}

export function authEmailRedirectMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }

  const path = req.path || "/";
  if (path !== "/" && path !== "/auth/callback") {
    next();
    return;
  }

  if (!isAuthEmailCallbackQuery(req.query)) {
    next();
    return;
  }

  res.redirect(302, buildFrontendAuthCallbackUrl(req.query));
}
