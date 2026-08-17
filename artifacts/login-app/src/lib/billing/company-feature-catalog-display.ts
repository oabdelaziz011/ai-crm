/**
 * Display ordering / sections for Company Feature Access UI.
 * Not authorization — presentation only over feature_definitions entitlements.
 */

export type CompanyFeatureCatalogSectionId = "product" | "administration" | "legacy";

const PRODUCT_ORDER = [
  "customers",
  "leads",
  "opportunities",
  "bookings",
  "operations",
  "ticketing",
  "finance",
  "ai_employee",
  "ai_assistant",
  "ai_email_routing",
  "ai_ticketing",
  "ai_suggested_replies",
  "workflow_automation",
  "omnichannel",
  "whatsapp_channel",
  "facebook_channel",
  "instagram_channel",
  "email_channel",
  "sms_channel",
  "basic_reports",
  "advanced_reports",
  "api_access",
] as const;

const ADMIN_ORDER = [
  "administration",
  "users_roles",
  "company_settings",
  "security_audit",
] as const;

const LEGACY_CODES = new Set(["core_crm"]);

function orderIndex(code: string, order: readonly string[]): number {
  const idx = order.indexOf(code);
  return idx === -1 ? 10_000 : idx;
}

export function resolveCompanyFeatureCatalogSection(
  featureCode: string,
): CompanyFeatureCatalogSectionId {
  if (LEGACY_CODES.has(featureCode)) return "legacy";
  if ((ADMIN_ORDER as readonly string[]).includes(featureCode)) return "administration";
  return "product";
}

export function sortCompanyFeatureEntitlements<T extends { feature_code: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const sa = resolveCompanyFeatureCatalogSection(a.feature_code);
    const sb = resolveCompanyFeatureCatalogSection(b.feature_code);
    const sectionRank = { product: 0, administration: 1, legacy: 2 } as const;
    if (sectionRank[sa] !== sectionRank[sb]) return sectionRank[sa] - sectionRank[sb];
    if (sa === "product") {
      return orderIndex(a.feature_code, PRODUCT_ORDER) - orderIndex(b.feature_code, PRODUCT_ORDER);
    }
    if (sa === "administration") {
      return orderIndex(a.feature_code, ADMIN_ORDER) - orderIndex(b.feature_code, ADMIN_ORDER);
    }
    return a.feature_code.localeCompare(b.feature_code);
  });
}

/** Hide empty legacy umbrella rows from the primary access list. */
export function filterCompanyFeatureEntitlementsForDisplay<
  T extends { feature_code: string },
>(
  rows: readonly T[],
  permissionCountByFeature: ReadonlyMap<string, readonly string[]>,
): T[] {
  return rows.filter((row) => {
    if (!LEGACY_CODES.has(row.feature_code)) return true;
    const mapped = permissionCountByFeature.get(row.feature_code) ?? [];
    return mapped.length > 0;
  });
}
