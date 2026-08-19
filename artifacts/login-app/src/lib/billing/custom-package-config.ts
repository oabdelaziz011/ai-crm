import type { TFunction } from "i18next";
import type { CompanyCommercialTerms } from "@/lib/billing/company-payable-amount";
import { translatePlanName } from "@/lib/billing/billing-display-i18n";

export const CUSTOM_PACKAGE_SENTINEL = "__custom__";

/** Commercial feature codes from feature_definitions (268 catalog). */
export const CUSTOM_FEATURE_GROUPS = [
  { id: "crm", codes: ["leads", "opportunities", "bookings", "operations", "ticketing"] },
  {
    id: "ai",
    codes: ["ai_employee", "ai_assistant", "ai_email_routing", "ai_ticketing", "ai_suggested_replies"],
  },
  {
    id: "channels",
    codes: [
      "whatsapp_channel",
      "facebook_channel",
      "instagram_channel",
      "email_channel",
      "sms_channel",
      "omnichannel",
    ],
  },
  { id: "automation", codes: ["workflow_automation"] },
  { id: "reports", codes: ["basic_reports", "advanced_reports"] },
  { id: "integration", codes: ["api_access"] },
] as const;

export type CustomFeatureGroupId = (typeof CUSTOM_FEATURE_GROUPS)[number]["id"];

export const RESOURCE_LIMIT_KEYS = ["users", "branches"] as const;

export const PERIODIC_QUOTA_METRIC_CODES = [
  "ai_email_routing",
  "ai_employee_email",
  "api_calls",
  "whatsapp_messages",
  "ai_tokens",
  "emails_sent",
  "sms_sent",
  "storage_bytes",
] as const;

export const GAUGE_METRIC_CODES = new Set(["storage_bytes", "users"]);

export type QuotaControlKind = "numeric" | "unlimited" | "informational";

export function quotaControlKind(input: {
  code: string;
  aggregationType?: string | null;
  billable?: boolean | null;
}): QuotaControlKind {
  const aggregation = String(input.aggregationType ?? "").toLowerCase();
  if (aggregation === "gauge" || GAUGE_METRIC_CODES.has(input.code)) {
    return "informational";
  }
  if (input.billable === false && input.code === "users") return "informational";
  return "numeric";
}

export function parseNonNegativeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function remainingFromLimit(
  used: number,
  limit: number | null,
  unlimited: boolean,
): number | null {
  if (unlimited || limit == null) return null;
  return Math.max(limit - used, 0);
}

export function isOverLimit(used: number, limit: number | null, unlimited: boolean): boolean {
  if (unlimited || limit == null) return false;
  return used > limit;
}

export function resolveDisplayedPackageLabel(
  t: TFunction,
  input: {
    hasSubscription: boolean;
    terms?: CompanyCommercialTerms | null;
    plan?: { code?: string | null; display_name?: string | null; name?: string | null } | null;
  },
): string {
  if (!input.hasSubscription) return t("companies.changePackage.noSubscription");
  if (input.terms?.pricing_source === "custom") {
    const customName = input.terms.custom_package_name?.trim();
    return customName || t("companies.changePackage.customPackage");
  }
  return translatePlanName(t, input.plan);
}

export function localizedFeatureLabel(
  t: TFunction,
  code: string,
  fallback?: string | null,
): string {
  const key = `companies.changePackage.featureLabels.${code}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;
  const trimmed = fallback?.trim();
  return trimmed || code;
}
