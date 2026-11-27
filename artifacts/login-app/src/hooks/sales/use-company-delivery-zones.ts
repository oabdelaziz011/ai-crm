import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  deliveryZoneToInsert,
  deliveryZoneToUpdate,
  normalizeDeliveryZone,
  validateDeliveryZone,
  type CompanyDeliveryZoneFormValues,
  type CompanyDeliveryZoneRow,
} from "@/lib/sales-order-settings/company-delivery-zones";

export const COMPANY_DELIVERY_ZONES_KEY = ["sales", "company-delivery-zones"] as const;

export function companyDeliveryZonesKey(companyId: string | null) {
  return [...COMPANY_DELIVERY_ZONES_KEY, companyId] as const;
}

function zonesReadError(message: string): Error {
  if (/relation .* does not exist|Could not find the table/i.test(message)) {
    return new Error(
      "Company delivery zones table is missing. Apply migration 470 on the local database before using this page.",
    );
  }
  if (/permission|rls|row-level|401|403/i.test(message)) {
    return new Error(`Not allowed to read delivery zones: ${message}`);
  }
  return new Error(`Could not load delivery zones: ${message}`);
}

export function useCompanyDeliveryZones(companyId: string | null) {
  return useQuery({
    queryKey: companyDeliveryZonesKey(companyId),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<CompanyDeliveryZoneFormValues[]> => {
      if (!companyId) throw new Error("Company required");
      const { data, error } = await supabase
        .from("company_delivery_zones")
        .select("*")
        .eq("company_id", companyId)
        .order("governorate", { ascending: true })
        .order("zone_name", { ascending: true });
      if (error) throw zonesReadError(error.message);
      return ((data ?? []) as CompanyDeliveryZoneRow[]).map(normalizeDeliveryZone);
    },
  });
}

export function useSaveCompanyDeliveryZone(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: CompanyDeliveryZoneFormValues) => {
      if (!companyId) throw new Error("Company required");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const validationError = validateDeliveryZone(values);
      if (validationError) throw new Error(validationError);

      if (values.id) {
        const { data, error } = await supabase
          .from("company_delivery_zones")
          .update(deliveryZoneToUpdate(values))
          .eq("id", values.id)
          .eq("company_id", companyId)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        return normalizeDeliveryZone(data as CompanyDeliveryZoneRow);
      }

      const { data, error } = await supabase
        .from("company_delivery_zones")
        .insert(deliveryZoneToInsert(companyId, values))
        .select("*")
        .single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) {
          throw new Error("zone_duplicate");
        }
        throw new Error(error.message);
      }
      return normalizeDeliveryZone(data as CompanyDeliveryZoneRow);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyDeliveryZonesKey(companyId) });
    },
  });
}

export function useDeleteCompanyDeliveryZone(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (zoneId: string) => {
      if (!companyId) throw new Error("Company required");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("company_delivery_zones")
        .delete()
        .eq("id", zoneId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyDeliveryZonesKey(companyId) });
    },
  });
}

export function useCompanyReviewerOptions(companyId: string | null) {
  return useQuery({
    queryKey: ["sales", "company-reviewer-options", companyId] as const,
    enabled: Boolean(companyId),
    queryFn: async (): Promise<Array<{ id: string; label: string }>> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: String(row.id),
        label: String(row.full_name || row.email || row.id),
      }));
    },
  });
}
