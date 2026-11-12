/**
 * Root-mounted routers that register `router.use(requireSupabaseAuth)` or
 * `requireCompanyScope` would otherwise run for every API path. When a later
 * route such as GET /mobile/session should handle the request, those global
 * middleware stacks must exit the current router first.
 *
 * `next("router")` skips the remainder of this router and continues mounting
 * order in the parent — without rejecting the request as "companyId required".
 */
import type { NextFunction, Request, Response } from "express";

export function confineToPathPrefixes(...prefixes: string[]) {
  const normalized = prefixes
    .map((prefix) => prefix.trim())
    .filter(Boolean)
    .map((prefix) => (prefix.endsWith("/") ? prefix.slice(0, -1) : prefix));

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (normalized.length === 0) {
      next();
      return;
    }
    const path = req.path || "";
    const matched = normalized.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
    if (!matched) {
      next("router");
      return;
    }
    next();
  };
}
