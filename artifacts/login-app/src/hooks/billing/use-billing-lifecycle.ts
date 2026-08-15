import { useMutation, useQueryClient } from "@tanstack/react-query";
import { COMPANY_SUBSCRIPTIONS_KEY } from "@/hooks/billing/use-company-subscriptions";
import {
  clampLifecycleEnforcementLimit,
  LIFECYCLE_ENFORCEMENT_DEFAULT_LIMIT,
  LIFECYCLE_ENFORCEMENT_MAX_LIMIT,
} from "@/lib/billing/lifecycle-enforcement-summary";
import { supabase } from "@/lib/supabase";

export {
  clampLifecycleEnforcementLimit,
  LIFECYCLE_ENFORCEMENT_DEFAULT_LIMIT,
  LIFECYCLE_ENFORCEMENT_MAX_LIMIT,
} from "@/lib/billing/lifecycle-enforcement-summary";

/** UI visibility for Mark Past Due — matches Phase 7.9B product gate (status === active). */
export const MARK_PAST_DUE_UI_STATUSES = ["active"] as const;

/**
 * Statuses from which record_subscription_renewal_failure_v1 can enter grace
 * (assert_subscription_status_transition → grace_period).
 * grace_period / expired / canceled are skipped or rejected by the RPC — do not invent others.
 */
export const RECORD_RENEWAL_FAILURE_UI_STATUSES = ["active", "trialing", "past_due"] as const;

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
}

function invalidatePlatformLifecycleLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: COMPANY_SUBSCRIPTIONS_KEY });
  qc.invalidateQueries({ queryKey: ["billing", "platform"] });
}

export function useMarkSubscriptionPastDue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { companyId: string; reason?: string | null }) => {
      const { data, error } = await supabase.rpc("mark_subscription_past_due_v1", {
        p_company_id: input.companyId,
        p_reason: input.reason ?? null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => invalidateBillingCompany(qc, variables.companyId),
  });
}

export function useRecordSubscriptionRenewalFailure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { companyId: string; reason?: string | null }) => {
      const { data, error } = await supabase.rpc("record_subscription_renewal_failure_v1", {
        p_company_id: input.companyId,
        p_reason: input.reason ?? null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => invalidateBillingCompany(qc, variables.companyId),
  });
}

export function useRunSubscriptionLifecycleEnforcement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { limit?: number } = {}) => {
      const limit = clampLifecycleEnforcementLimit(
        input.limit ?? LIFECYCLE_ENFORCEMENT_DEFAULT_LIMIT,
      );
      const { data, error } = await supabase.rpc("run_subscription_lifecycle_enforcement_v1", {
        p_limit: limit,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: () => invalidatePlatformLifecycleLists(qc),
  });
}
