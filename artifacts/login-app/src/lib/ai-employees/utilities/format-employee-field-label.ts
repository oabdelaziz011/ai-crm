import type { TFunction } from "i18next";

const DEPARTMENT_ALIASES: Record<string, string> = {
  "customer support": "customerSupport",
  support: "support",
  sales: "sales",
  operations: "operations",
  marketing: "marketing",
};

const PROVIDER_ALIASES: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  azure: "azure",
};

/** Translate common free-text department values when a locale key exists. */
export function formatEmployeeDepartmentLabel(
  t: TFunction<"common">,
  department: string | null | undefined,
): string {
  if (!department?.trim()) return "—";
  const alias = DEPARTMENT_ALIASES[department.trim().toLowerCase()];
  if (!alias) return department;
  return t(`aiEmployees.fields.departments.${alias}`, { defaultValue: department });
}

/** Friendly provider label (keeps unknown keys as-is). */
export function formatEmployeeProviderLabel(
  t: TFunction<"common">,
  provider: string | null | undefined,
): string {
  if (!provider?.trim()) return "—";
  const alias = PROVIDER_ALIASES[provider.trim().toLowerCase()];
  if (!alias) return provider;
  return t(`aiEmployees.fields.providers.${alias}`, { defaultValue: provider });
}
