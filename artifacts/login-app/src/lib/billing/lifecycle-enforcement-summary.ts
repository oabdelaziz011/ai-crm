/**
 * Maps run_subscription_lifecycle_enforcement_v1 JSON into display rows.
 * Property names follow migration 273; unknown shapes degrade gracefully.
 */

export const LIFECYCLE_ENFORCEMENT_DEFAULT_LIMIT = 100;
export const LIFECYCLE_ENFORCEMENT_MAX_LIMIT = 500;

export function clampLifecycleEnforcementLimit(limit: number): number {
  if (!Number.isFinite(limit)) return LIFECYCLE_ENFORCEMENT_DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(limit), LIFECYCLE_ENFORCEMENT_MAX_LIMIT));
}


function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readCount(bucket: Record<string, unknown> | null, keys: string[]): number | null {
  if (!bucket) return null;
  for (const key of keys) {
    const raw = bucket[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) {
      return Number(raw);
    }
  }
  return null;
}

export type LifecycleEnforcementSummaryRow = {
  key: string;
  label: string;
  value: string | number;
};

export function summarizeLifecycleEnforcementResult(
  result: Record<string, unknown> | null | undefined,
): LifecycleEnforcementSummaryRow[] {
  if (!result) return [];

  const trials = asRecord(result.trials);
  const activePeriodDue = asRecord(result.active_period_due);
  const pastDueToGrace = asRecord(result.past_due_to_grace);
  const graceExpirations = asRecord(result.grace_expirations);
  const renewal = asRecord(result.renewal);

  const trialProcessed = readCount(trials, ["processed_count", "processed"]);
  const activeToPastDue = readCount(activePeriodDue, ["processed_count", "processed"]);
  const pastDueToGraceCount = readCount(pastDueToGrace, ["processed_count", "processed"]);
  const graceExpired = readCount(graceExpirations, [
    "expired_count",
    "processed_count",
    "processed",
  ]);

  const processedParts = [trialProcessed, activeToPastDue, pastDueToGraceCount, graceExpired].filter(
    (n): n is number => n != null,
  );
  const processedTotal =
    processedParts.length > 0 ? processedParts.reduce((sum, n) => sum + n, 0) : null;

  const errorCount =
    readCount(asRecord(result), ["error_count", "errors_count"]) ??
    (Array.isArray(result.errors) ? result.errors.length : null);

  const rows: LifecycleEnforcementSummaryRow[] = [];

  if (typeof result.limit === "number") {
    rows.push({ key: "limit", label: "Limit", value: result.limit });
  }
  if (processedTotal != null) {
    rows.push({ key: "processed", label: "Processed", value: processedTotal });
  }
  if (trialProcessed != null) {
    rows.push({ key: "trials", label: "Trial expirations", value: trialProcessed });
  }
  if (activeToPastDue != null) {
    rows.push({ key: "active_past_due", label: "Active → past due", value: activeToPastDue });
  }
  if (pastDueToGraceCount != null) {
    rows.push({
      key: "past_due_grace",
      label: "Past due → grace",
      value: pastDueToGraceCount,
    });
  }
  if (graceExpired != null) {
    rows.push({ key: "grace_expired", label: "Grace → expired", value: graceExpired });
  }
  if (errorCount != null) {
    rows.push({ key: "errors", label: "Errors", value: errorCount });
  }
  if (renewal && renewal.automatic_paid_renewal === false) {
    rows.push({
      key: "no_auto_renewal",
      label: "Paid renewal",
      value: "Not performed (lifecycle only)",
    });
  }

  if (rows.length === 0) {
    rows.push({ key: "raw", label: "Result", value: JSON.stringify(result) });
  }

  return rows;
}
