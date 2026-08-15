import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Company } from "@/lib/types";
import type { CompanyOnboardingPayload } from "@/lib/companies/onboarding";
import { COMPANIES_KEY } from "@/hooks/use-companies";

export type OnboardOwnCompanyResult = {
  company: Company;
  companyId: string;
  roleId: string | null;
  trialEndsAt: string | null;
  trialFeatures: string[];
  subscriptionId: string | null;
};

function mapRpcError(message: string): Error {
  const normalized = message.toLowerCase();
  if (normalized.includes("company_already_assigned")) {
    return new Error("company_already_assigned");
  }
  if (normalized.includes("not_authenticated")) {
    return new Error("not_authenticated");
  }
  if (normalized.includes("forbidden") || normalized.includes("super_admin_use_admin_create")) {
    return new Error("forbidden");
  }
  if (normalized.includes("duplicate_onboarding")) {
    return new Error("duplicate_onboarding");
  }
  if (normalized.includes("unknown_trial_feature_code")) {
    return new Error("unknown_trial_feature_code");
  }
  if (normalized.includes("inactive_trial_feature_code")) {
    return new Error("inactive_trial_feature_code");
  }
  return new Error(message);
}

function readTrialMeta(data: Record<string, unknown> | null | undefined) {
  const trialEndsAt =
    typeof data?.trial_ends_at === "string"
      ? data.trial_ends_at
      : data?.trial_ends_at != null
        ? String(data.trial_ends_at)
        : null;
  const trialFeatures = Array.isArray(data?.trial_features)
    ? data.trial_features.map(String)
    : [];
  const subscription = (data?.subscription ?? null) as Record<string, unknown> | null;
  const subscriptionId =
    typeof subscription?.subscription_id === "string" ? subscription.subscription_id : null;
  return { trialEndsAt, trialFeatures, subscriptionId };
}

export function useOnboardOwnCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CompanyOnboardingPayload): Promise<OnboardOwnCompanyResult> => {
      const { data, error } = await supabase.rpc("onboard_own_company_v1", {
        p_payload: payload,
      });
      if (error) throw mapRpcError(error.message);
      const company = (data?.company ?? null) as Company | null;
      if (!company?.id) {
        throw new Error("Company onboarding did not return a company.");
      }
      const meta = readTrialMeta(data as Record<string, unknown>);
      return {
        company,
        companyId: String(data.company_id ?? company.id),
        roleId: data.role_id ? String(data.role_id) : null,
        trialEndsAt: meta.trialEndsAt,
        trialFeatures: meta.trialFeatures,
        subscriptionId: meta.subscriptionId,
      };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: COMPANIES_KEY });
      void qc.invalidateQueries({ queryKey: ["rbac"] });
      void qc.invalidateQueries({ queryKey: ["billing"] });
      void qc.invalidateQueries({ queryKey: ["feature-flag"] });
      void qc.invalidateQueries({ queryKey: ["license-access"] });
    },
  });
}

export function useCreateCompanyAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CompanyOnboardingPayload): Promise<Company> => {
      const { data, error } = await supabase.rpc("create_company_admin_v1", {
        p_payload: payload,
      });
      if (error) {
        if (error.message.toLowerCase().includes("forbidden")) {
          throw new Error("forbidden");
        }
        throw new Error(error.message);
      }
      const company = (data?.company ?? null) as Company | null;
      if (!company?.id) {
        throw new Error("Company create did not return a company.");
      }
      if (company.tenant_provisioning_status === "failed") {
        throw new Error(
          company.provisioning_error ??
            "Company was created but tenant provisioning failed.",
        );
      }
      return company;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: COMPANIES_KEY });
      void qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
      void qc.invalidateQueries({ queryKey: ["billing"] });
      void qc.invalidateQueries({ queryKey: ["feature-flag"] });
      void qc.invalidateQueries({ queryKey: ["license-access"] });
    },
  });
}
