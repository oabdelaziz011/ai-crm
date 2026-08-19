import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { COMPANIES_KEY } from "@/hooks/use-companies";
import type { Company } from "@/lib/types";
import {
  classifyRejectCompanyError,
  parseRejectCompanyResponse,
} from "@/lib/companies/reject-company-flow";
import {
  bindCompanyFeatureEntitlementClient,
  extendCompanyTrial,
  revokeCompanyFeatureGrant,
  setCompanyFeatureGrant,
} from "@/lib/billing/company-feature-entitlement-service";

bindCompanyFeatureEntitlementClient(supabase);

function invalidateCommercialQueries(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: COMPANIES_KEY }),
    qc.invalidateQueries({ queryKey: ["billing"] }),
    qc.invalidateQueries({ queryKey: ["feature-flag"] }),
    qc.invalidateQueries({ queryKey: ["license-access"] }),
  ]);
}

export function useApproveCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      mode: "trial" | "active";
      notes?: string | null;
    }): Promise<Company> => {
      const { data, error } = await supabase.rpc("approve_company_v1", {
        p_company_id: input.companyId,
        p_mode: input.mode,
        p_notes: input.notes ?? null,
      });
      if (error) throw new Error(error.message);
      const company = (data?.company ?? null) as Company | null;
      if (!company?.id) throw new Error("Approve did not return a company.");
      return company;
    },
    onSuccess: async () => {
      await invalidateCommercialQueries(qc);
    },
  });
}

export function useRejectCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { companyId: string; reason: string }): Promise<Company> => {
      const trimmed = input.reason.trim();
      if (!trimmed) {
        throw new Error("rejection_reason_required");
      }

      const { data, error } = await supabase.rpc("reject_company_v1", {
        p_company_id: input.companyId,
        p_reason: trimmed,
      });
      if (error) {
        const code = classifyRejectCompanyError(error.message ?? "");
        throw new Error(code === "unknown" ? error.message : code);
      }

      try {
        const company = parseRejectCompanyResponse(data);
        await invalidateCommercialQueries(qc);
        return company;
      } catch {
        throw new Error("invalidResponse");
      }
    },
  });
}

export function useExtendCompanyTrial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { companyId: string; newEndsAt: string }) => {
      return extendCompanyTrial(input.companyId, input.newEndsAt);
    },
    onSuccess: () => invalidateCommercialQueries(qc),
  });
}

export function useSetCompanyFeatureGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      featureCode: string;
      enabled: boolean;
      source?: "trial" | "manual" | "contract" | "system";
      startsAt?: string | null;
      expiresAt?: string | null;
      notes?: string | null;
    }) => {
      return setCompanyFeatureGrant({
        companyId: input.companyId,
        featureCode: input.featureCode,
        enabled: input.enabled,
        source: input.source ?? "manual",
        startsAt: input.startsAt,
        expiresAt: input.expiresAt,
        notes: input.notes,
      });
    },
    onSuccess: () => invalidateCommercialQueries(qc),
  });
}

export function useRevokeCompanyFeatureGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { companyId: string; featureCode: string; notes?: string | null }) => {
      return revokeCompanyFeatureGrant(input.companyId, input.featureCode, input.notes);
    },
    onSuccess: () => invalidateCommercialQueries(qc),
  });
}
