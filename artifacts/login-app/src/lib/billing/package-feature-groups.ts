/**
 * Package feature UI grouping + type aliases (Phase 7.3).
 * Packaging metadata helpers — NOT runtime authorization.
 */

import type { Plan } from "@/lib/types";

/** Canonical commercial package row = plans table. */
export type CommercialPackage = Plan;

export type PackageFeatureSelection = {
  code: string;
  label: string;
  category: string;
  is_billable: boolean;
  requires_subscription?: boolean;
};

export type PackageFeatureGroupId =
  | "core"
  | "crm_ops"
  | "ai"
  | "channels"
  | "automation"
  | "reporting"
  | "integration"
  | "other";

const GROUP_ORDER: PackageFeatureGroupId[] = [
  "core",
  "crm_ops",
  "ai",
  "channels",
  "automation",
  "reporting",
  "integration",
  "other",
];

const GROUP_LABELS: Record<PackageFeatureGroupId, string> = {
  core: "Core",
  crm_ops: "CRM / Operations",
  ai: "AI",
  channels: "Channels",
  automation: "Automation",
  reporting: "Reporting",
  integration: "Integration",
  other: "Other",
};

const CATEGORY_TO_GROUP: Record<string, PackageFeatureGroupId> = {
  core: "core",
  crm: "crm_ops",
  sales: "crm_ops",
  scheduling: "crm_ops",
  operations: "crm_ops",
  service: "crm_ops",
  ai: "ai",
  channels: "channels",
  automation: "automation",
  reporting: "reporting",
  integrations: "integration",
  billing: "other",
  admin: "core",
};

/** Core / platform catalog codes that remain non-commercial under Phase 6 + 302. */
const CORE_FEATURE_CODES = new Set([
  "core_crm",
  "customers",
  "users_roles",
  "company_settings",
  "administration",
  "security_audit",
]);

export function isCorePackageFeature(feature: PackageFeatureSelection): boolean {
  if (CORE_FEATURE_CODES.has(feature.code)) return true;
  return feature.is_billable === false && feature.requires_subscription !== true;
}

export function resolvePackageFeatureGroupId(
  feature: PackageFeatureSelection,
): PackageFeatureGroupId {
  if (isCorePackageFeature(feature)) return "core";
  return CATEGORY_TO_GROUP[feature.category] ?? "other";
}

export function packageFeatureGroupLabel(groupId: PackageFeatureGroupId): string {
  return GROUP_LABELS[groupId];
}

export function groupPackageFeaturesForEditor(
  features: PackageFeatureSelection[],
): Array<{ id: PackageFeatureGroupId; label: string; features: PackageFeatureSelection[] }> {
  const buckets = new Map<PackageFeatureGroupId, PackageFeatureSelection[]>();
  for (const feature of features) {
    const id = resolvePackageFeatureGroupId(feature);
    const list = buckets.get(id) ?? [];
    list.push(feature);
    buckets.set(id, list);
  }

  return GROUP_ORDER.filter((id) => (buckets.get(id)?.length ?? 0) > 0).map((id) => ({
    id,
    label: packageFeatureGroupLabel(id),
    features: buckets.get(id) ?? [],
  }));
}
