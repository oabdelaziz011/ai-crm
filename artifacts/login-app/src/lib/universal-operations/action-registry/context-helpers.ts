import type { OperationsRow, OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import type { OperationsActionRuntime } from "./types";

export function statusInternalName(
  runtime: OperationsActionRuntime,
): string | undefined {
  const { row, config } = runtime;
  const fromConfig = config?.statuses.find((s) => s.id === row.statusId)?.internalName;
  if (fromConfig) return fromConfig;
  return row.statusId.replace(/^st_/, "");
}

export function paymentInternalName(
  runtime: OperationsActionRuntime,
): string | undefined {
  const { row, config } = runtime;
  const fromConfig = config?.paymentStatuses.find((s) => s.id === row.paymentStatusId)?.internalName;
  if (fromConfig) return fromConfig;
  return row.paymentStatusId.replace(/^pay_/, "");
}

export function isStatusIn(runtime: OperationsActionRuntime, allowed: string[]): boolean {
  const current = statusInternalName(runtime);
  return Boolean(current && allowed.includes(current));
}

export function isPaymentIn(runtime: OperationsActionRuntime, allowed: string[]): boolean {
  const current = paymentInternalName(runtime);
  return Boolean(current && allowed.includes(current));
}

export function hasAnyPermission(
  runtime: Pick<OperationsActionRuntime, "hasPermission" | "isSuperAdmin">,
  codes: string[],
): boolean {
  if (runtime.isSuperAdmin) return true;
  if (!codes.length) return true;
  return codes.some((code) => runtime.hasPermission(code));
}

export function hasClinicRole(
  runtime: Pick<OperationsActionRuntime, "clinicRole" | "actorRole" | "isSuperAdmin">,
  allowed?: string[],
): boolean {
  if (!allowed?.length) return true;
  if (runtime.isSuperAdmin) return true;
  const role = runtime.actorRole ?? runtime.clinicRole;
  if (!role) return true; // no role context → permission codes decide
  if (role === "manager") return true;
  return allowed.includes(role);
}

export function hasActorRole(
  runtime: Pick<OperationsActionRuntime, "clinicRole" | "actorRole" | "isSuperAdmin">,
  allowed?: string[],
): boolean {
  return hasClinicRole(runtime, allowed);
}

export function isBillingEnabled(runtime: OperationsActionRuntime): boolean {
  const flags = runtime.featureFlags;
  if (Object.prototype.hasOwnProperty.call(flags, "billing")) return Boolean(flags.billing);
  if (Object.prototype.hasOwnProperty.call(flags, "billingEnabled")) return Boolean(flags.billingEnabled);
  // Default: billing available when payment statuses exist in workspace config.
  return Boolean(runtime.config?.paymentStatuses?.length);
}

export function hasOutstandingBalance(row: OperationsRow): boolean {
  const amount = Number(row.values.amount) || 0;
  return amount > 0;
}

export function rowPhone(row: OperationsRow): string | null {
  const phone = row.values.phone;
  return phone == null || phone === "" ? null : String(phone);
}

export function rowAmountCents(row: OperationsRow): number {
  const amount = Number(row.values.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function featureFlagsFromConfig(
  config: OperationsWorkspaceConfig | undefined,
): Record<string, boolean> {
  return config?.featureFlags?.flags ?? {};
}
