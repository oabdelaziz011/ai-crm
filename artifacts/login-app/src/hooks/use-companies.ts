import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Company, CompanyInsert, CompanyUpdate, TenantProvisioningStatus } from "@/lib/types";

export const COMPANIES_KEY = ["companies"] as const;

function isTenantProvisioningComplete(status: TenantProvisioningStatus | undefined): boolean {
  return status === "completed";
}

async function assertTenantProvisioningComplete(company: Company): Promise<void> {
  if (isTenantProvisioningComplete(company.tenant_provisioning_status)) {
    return;
  }

  if (company.tenant_provisioning_status === "failed") {
    throw new Error(
      company.provisioning_error ??
        "Company was created but tenant provisioning failed. Retry provisioning from the Companies page.",
    );
  }

  if (company.tenant_provisioning_status === "provisioning") {
    throw new Error("Tenant provisioning is still in progress. Refresh and try again.");
  }

  throw new Error(
    company.provisioning_error ??
      `Company created but tenant provisioning is incomplete (status: ${company.tenant_provisioning_status ?? "unknown"}). Retry from the Companies page.`,
  );
}

export function useCompanies(enabled = true) {
  return useQuery({
    queryKey: COMPANIES_KEY,
    enabled,
    queryFn: async (): Promise<Company[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("*, plan:plans(*)")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Company[];
    },
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: CompanyInsert) => {
      const { data: rpcData, error: rpcError } = await supabase.rpc("create_company_v1", {
        p_name: values.name,
        p_status: values.status,
        p_subscription_plan: values.subscription_plan,
        p_subscription_expires_at: values.subscription_expires_at ?? null,
        p_logo_url: values.logo_url ?? null,
      });

      if (!rpcError && rpcData?.company) {
        const company = rpcData.company as Company;
        await assertTenantProvisioningComplete(company);
        return company;
      }

      if (rpcError && !rpcError.message.includes("forbidden")) {
        throw new Error(rpcError.message);
      }

      const { data, error } = await supabase
        .from("companies")
        .insert({ ...values, company_type: "tenant" })
        .select()
        .single();
      if (error) throw new Error(error.message);

      await assertTenantProvisioningComplete(data as Company);
      return data as Company;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: COMPANIES_KEY });
      void qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
    },
  });
}

export function useRetryTenantProvisioning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await supabase.rpc("retry_tenant_provisioning", {
        p_company_id: companyId,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: COMPANIES_KEY });
      void qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
    },
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: CompanyUpdate }) => {
      const { data, error } = await supabase
        .from("companies")
        .update(values)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Company;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COMPANIES_KEY }),
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COMPANIES_KEY }),
  });
}
