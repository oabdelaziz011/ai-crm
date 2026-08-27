import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { COMPANY_SUBSCRIPTIONS_KEY } from "@/hooks/billing/use-company-subscriptions";
import { COMPANIES_KEY } from "@/hooks/use-companies";

function invalidateBillingCompany(qc: ReturnType<typeof useQueryClient>, companyId: string) {
  qc.invalidateQueries({ queryKey: COMPANY_SUBSCRIPTIONS_KEY });
  qc.invalidateQueries({ queryKey: [...COMPANY_SUBSCRIPTIONS_KEY, companyId] });
  qc.invalidateQueries({ queryKey: ["billing", "billing-contact", companyId] });
  qc.invalidateQueries({ queryKey: ["billing", "subscription-events"] });
  qc.invalidateQueries({ queryKey: ["billing", "audit-log"] });
  qc.invalidateQueries({ queryKey: ["billing", "entitlements", companyId] });
  qc.invalidateQueries({ queryKey: ["billing", "invoices", companyId] });
  qc.invalidateQueries({ queryKey: ["billing", "payments", companyId] });
  qc.invalidateQueries({ queryKey: ["billing", "receipts", companyId] });
  qc.invalidateQueries({ queryKey: ["notifications", "list", companyId] });
  qc.invalidateQueries({ queryKey: ["billing", "company-subscription-review", companyId] });
  qc.invalidateQueries({ queryKey: COMPANIES_KEY });
}

export function useUpsertBillingContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { companyId: string; name: string; email: string; phone?: string | null }) => {
      const { data, error } = await supabase.rpc("upsert_billing_contact", {
        p_company_id: input.companyId,
        p_name: input.name,
        p_email: input.email,
        p_phone: input.phone ?? null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => invalidateBillingCompany(qc, variables.companyId),
  });
}

export function useAssignSubscriptionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { companyId: string; planId: string; billingCycle?: "monthly" | "yearly" | null }) => {
      // Initial / bootstrap package assignment only.
      // Existing paid package changes MUST use change_company_package_v1 (useChangeCompanyPackage).
      const { data, error } = await supabase.rpc("assign_subscription_plan", {
        p_company_id: input.companyId,
        p_plan_id: input.planId,
        p_billing_cycle: input.billingCycle ?? null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => invalidateBillingCompany(qc, variables.companyId),
  });
}

export function useSuspendBillingSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { companyId: string; reason: string }) => {
      const reason = input.reason.trim();
      if (!reason) throw new Error("suspension_reason_required");
      const { data, error } = await supabase.rpc("suspend_billing_subscription", {
        p_company_id: input.companyId,
        p_reason: reason,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => invalidateBillingCompany(qc, variables.companyId),
  });
}

export function useRestoreBillingSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { companyId: string; reason?: string | null }) => {
      const { data, error } = await supabase.rpc("restore_billing_subscription", {
        p_company_id: input.companyId,
        p_reason: input.reason ?? null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => invalidateBillingCompany(qc, variables.companyId),
  });
}

export function useCancelBillingSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      reason?: string | null;
      atPeriodEnd?: boolean;
    }) => {
      const { data, error } = await supabase.rpc("cancel_company_subscription_v1", {
        p_company_id: input.companyId,
        p_reason: input.reason ?? null,
        p_at_period_end: input.atPeriodEnd ?? false,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => invalidateBillingCompany(qc, variables.companyId),
  });
}

export function useConvertTrialToPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      planId: string;
      billingCycle: "monthly" | "yearly";
      reason?: string | null;
      conversionSource?: "admin" | "payment" | "api" | "migration" | "system";
    }) => {
      const { data, error } = await supabase.rpc("convert_trial_to_paid_v1", {
        p_company_id: input.companyId,
        p_plan_id: input.planId,
        p_billing_cycle: input.billingCycle,
        p_reason: input.reason ?? null,
        p_conversion_source: input.conversionSource ?? "admin",
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => invalidateBillingCompany(qc, variables.companyId),
  });
}

export function useChangeCompanyPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      planId: string;
      reason?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("change_company_package_v1", {
        p_company_id: input.companyId,
        p_plan_id: input.planId,
        p_reason: input.reason ?? null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => {
      invalidateBillingCompany(qc, variables.companyId);
      void qc.invalidateQueries({ queryKey: ["billing", "commercial-packages"] });
    },
  });
}

export function useConfigureCompanyCustomPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      packageName: string;
      billingCycle: "monthly" | "yearly";
      customPriceMonthly: number | null;
      customPriceYearly: number | null;
      notes: string | null;
      featureCodes: string[];
      maxUsers: number | null;
      maxBranches: number | null;
      usageLimits: Array<{
        metric_code: string;
        included_quantity: number | null;
        is_unlimited: boolean;
      }>;
    }) => {
      const { data, error } = await supabase.rpc("configure_company_custom_package_v1", {
        p_company_id: input.companyId,
        p_package_name: input.packageName,
        p_billing_cycle: input.billingCycle,
        p_custom_price_monthly: input.customPriceMonthly,
        p_custom_price_yearly: input.customPriceYearly,
        p_notes: input.notes,
        p_feature_codes: input.featureCodes,
        p_max_users: input.maxUsers,
        p_max_branches: input.maxBranches,
        p_usage_limits: input.usageLimits,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => {
      invalidateBillingCompany(qc, variables.companyId);
      void qc.invalidateQueries({ queryKey: ["billing", "company-commercial-terms"] });
      void qc.invalidateQueries({ queryKey: ["billing", "company-resource-occupancy"] });
    },
  });
}
