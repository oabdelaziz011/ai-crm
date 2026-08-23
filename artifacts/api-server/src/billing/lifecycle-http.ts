export const LIFECYCLE_ENFORCE_DEFAULT_LIMIT = 100;
export const LIFECYCLE_ENFORCE_MAX_LIMIT = 500;

export type LifecycleAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; code: string; message: string };

export function clampLifecycleEnforceLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return LIFECYCLE_ENFORCE_DEFAULT_LIMIT;
  return Math.max(1, Math.min(LIFECYCLE_ENFORCE_MAX_LIMIT, Math.trunc(n)));
}

export function hasClientSuppliedCompanyId(body: unknown, query: unknown): boolean {
  const fromBody =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).company_id ??
        (body as Record<string, unknown>).companyId
      : undefined;
  const fromQuery =
    query && typeof query === "object"
      ? (query as Record<string, unknown>).company_id ??
        (query as Record<string, unknown>).companyId
      : undefined;
  return fromBody != null || fromQuery != null;
}

export function resolveInternalLifecycleAuth(input: {
  configuredKey: string | undefined;
  authorizationHeader: string | undefined;
  internalKeyHeader: string | undefined;
}): LifecycleAuthResult {
  const configuredKey = input.configuredKey?.trim();
  if (!configuredKey) {
    return {
      ok: false,
      status: 503,
      code: "internal_key_missing",
      message: "Internal API key not configured.",
    };
  }

  const bearer = input.authorizationHeader?.startsWith("Bearer ")
    ? input.authorizationHeader.slice("Bearer ".length).trim()
    : null;
  const headerKey = input.internalKeyHeader?.trim() ?? null;

  if (bearer !== configuredKey && headerKey !== configuredKey) {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Internal authentication required.",
    };
  }

  return { ok: true };
}

export function isBillingLifecycleWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BILLING_LIFECYCLE_WORKER_ENABLED === "true";
}
