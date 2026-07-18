import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSupportedPaymentMethodCodes } from "@/lib/billing/settings-runtime";
import { parseBillingSettingString } from "@/lib/billing/parse-billing-setting";

export type BillingHealthIssue =
  | "migration_104_missing"
  | "migration_105_missing"
  | "default_currency_missing"
  | "payment_methods_missing"
  | "active_plan_missing_pricing";

export type BillingHealthResult = {
  healthy: boolean;
  issues: BillingHealthIssue[];
  checkedAt: string;
};

function isMigration104Missing(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    (lower.includes("could not find the function") || lower.includes("does not exist")) &&
    lower.includes("get_billing_payment_options")
  );
}

function isMigration105Missing(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("could not find the function") ||
    lower.includes("unknown argument") ||
    lower.includes("p_company_id")
  );
}

export async function runBillingHealthCheck(client: SupabaseClient): Promise<BillingHealthResult> {
  const issues: BillingHealthIssue[] = [];

  const { error: paymentOptionsError } = await client.rpc("get_billing_payment_options_v1", {
    p_company_id: null,
  });
  if (paymentOptionsError && isMigration104Missing(paymentOptionsError.message)) {
    issues.push("migration_104_missing");
  } else if (paymentOptionsError) {
    throw new Error(paymentOptionsError.message);
  }

  const { error: auditError } = await client.rpc("list_billing_audit_logs_paged", {
    p_limit: 1,
    p_offset: 0,
    p_search: null,
    p_event_type: null,
    p_for_export: false,
    p_company_id: null,
  });
  if (auditError && isMigration105Missing(auditError.message)) {
    issues.push("migration_105_missing");
  } else if (auditError && !auditError.message.toLowerCase().includes("insufficient permissions")) {
    throw new Error(auditError.message);
  }

  const { data: currencySetting, error: currencyError } = await client.rpc("get_billing_setting", {
    p_code: "default_currency",
    p_company_id: null,
  });
  if (currencyError) throw new Error(currencyError.message);
  if (!parseBillingSettingString(currencySetting)) {
    issues.push("default_currency_missing");
  }

  const { data: methodsSetting, error: methodsError } = await client.rpc("get_billing_setting", {
    p_code: "supported_payment_method_codes",
    p_company_id: null,
  });
  if (methodsError) throw new Error(methodsError.message);
  const methodCodes = parseSupportedPaymentMethodCodes(
    typeof methodsSetting === "string" ? methodsSetting : methodsSetting,
  );
  if (methodCodes.length === 0) {
    issues.push("payment_methods_missing");
  }

  const { data: plans, error: plansError } = await client
    .from("plans")
    .select("id,code,price_monthly,price_yearly")
    .eq("is_active", true);
  if (plansError) throw new Error(plansError.message);

  const plansMissingPricing = (plans ?? []).filter(
    (plan) =>
      plan.price_monthly == null ||
      plan.price_yearly == null ||
      Number(plan.price_monthly) <= 0 ||
      Number(plan.price_yearly) <= 0,
  );
  if ((plans ?? []).length === 0 || plansMissingPricing.length > 0) {
    issues.push("active_plan_missing_pricing");
  }

  return {
    healthy: issues.length === 0,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

export const BILLING_HEALTH_ISSUE_LABELS: Record<BillingHealthIssue, string> = {
  migration_104_missing: "Migration 104 missing (get_billing_payment_options_v1)",
  migration_105_missing: "Migration 105 missing (list_billing_audit_logs_paged p_company_id)",
  default_currency_missing: "default_currency is not configured",
  payment_methods_missing: "supported_payment_method_codes is empty or missing",
  active_plan_missing_pricing: "One or more active plans lack valid monthly/yearly pricing",
};
