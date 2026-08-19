import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
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
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<Company[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select(
          [
            "*",
            "plan:plans(*)",
            "billing_profile:company_billing_profiles(legal_name, address, tax_id, commercial_registration)",
            "branches(id, city, country, address_line1, timezone, is_primary, deleted_at)",
          ].join(", "),
        )
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => {
        const record = row as unknown as Company & {
          branches?: Array<{
            id?: string;
            city?: string | null;
            country?: string | null;
            address_line1?: string | null;
            timezone?: string | null;
            is_primary?: boolean;
            deleted_at?: string | null;
          }>;
        };
        const activeBranches = (record.branches ?? []).filter((branch) => !branch.deleted_at);
        const primary =
          activeBranches.find((branch) => branch.is_primary) ?? activeBranches[0] ?? null;
        const { branches: _branches, ...rest } = record;
        return {
          ...rest,
          primary_branch: primary
            ? {
                id: primary.id ?? null,
                city: primary.city ?? null,
                country: primary.country ?? null,
                address_line1: primary.address_line1 ?? null,
                timezone: primary.timezone ?? null,
              }
            : null,
        } as Company;
      });
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
    mutationFn: async ({
      id,
      values,
      identity,
    }: {
      id: string;
      values: CompanyUpdate;
      identity?: import("@/lib/types").CompanyIdentityUpdate;
    }) => {
      const { data, error } = await supabase
        .from("companies")
        .update(values)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);

      if (identity) {
        const billingPayload = {
          legal_name: identity.legal_name ?? null,
          address: identity.address ?? null,
          tax_id: identity.tax_id ?? null,
          commercial_registration: identity.commercial_registration ?? null,
        };

        const { error: billingError } = await supabase
          .from("company_billing_profiles")
          .upsert(
            { company_id: id, ...billingPayload },
            { onConflict: "company_id" },
          );
        if (billingError) throw new Error(billingError.message);

        if (identity.city != null || identity.country != null || identity.address != null) {
          const { data: branches, error: branchLoadError } = await supabase
            .from("branches")
            .select("id, is_primary, deleted_at")
            .eq("company_id", id)
            .is("deleted_at", null);
          if (branchLoadError) throw new Error(branchLoadError.message);

          const primary =
            (branches ?? []).find((branch) => branch.is_primary) ?? (branches ?? [])[0] ?? null;

          if (primary?.id) {
            const { error: branchUpdateError } = await supabase
              .from("branches")
              .update({
                city: identity.city ?? null,
                country: identity.country ?? null,
                address_line1: identity.address ?? null,
              })
              .eq("id", primary.id);
            if (branchUpdateError) throw new Error(branchUpdateError.message);
          } else {
            const { error: branchInsertError } = await supabase.from("branches").insert({
              company_id: id,
              name: values.name?.trim() || "Headquarters",
              timezone: "UTC",
              status: "active",
              city: identity.city ?? null,
              country: identity.country ?? null,
              address_line1: identity.address ?? null,
              is_primary: true,
            });
            if (branchInsertError) throw new Error(branchInsertError.message);
          }
        }
      }

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
