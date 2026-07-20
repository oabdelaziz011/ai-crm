import type { TenantAiBootstrapResult, TenantAiBootstrapStepResult } from "../types.js";

export function parseTenantAiBootstrapResult(payload: unknown, companyId: string): TenantAiBootstrapResult {
  const record = (payload ?? {}) as Record<string, unknown>;
  const steps = Array.isArray(record.steps)
    ? (record.steps as TenantAiBootstrapStepResult[])
    : [];

  return {
    companyId: String(record.company_id ?? companyId),
    skipped: Boolean(record.skipped),
    reason: typeof record.reason === "string" ? record.reason : undefined,
    steps,
  };
}
