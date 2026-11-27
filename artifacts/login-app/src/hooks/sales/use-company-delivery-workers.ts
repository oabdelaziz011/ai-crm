import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  deliveryWorkerToInsert,
  deliveryWorkerToUpdate,
  normalizeDeliveryWorker,
  validateDeliveryWorker,
  type CompanyDeliveryWorkerFormValues,
  type CompanyDeliveryWorkerRow,
  type CompanyDeliveryWorkerZoneLabel,
} from "@/lib/sales-order-settings/company-delivery-workers";

export const COMPANY_DELIVERY_WORKERS_KEY = ["sales", "company-delivery-workers"] as const;

export function companyDeliveryWorkersKey(companyId: string | null) {
  return [...COMPANY_DELIVERY_WORKERS_KEY, companyId] as const;
}

function workersReadError(message: string): Error {
  if (/relation .* does not exist|Could not find the table/i.test(message)) {
    return new Error(
      "Delivery workers table is missing. Apply migration 475 on the local database before using this page.",
    );
  }
  return new Error(`Could not load delivery workers: ${message}`);
}

async function loadZonesForWorkers(
  workerIds: string[],
): Promise<Map<string, CompanyDeliveryWorkerZoneLabel[]>> {
  const map = new Map<string, CompanyDeliveryWorkerZoneLabel[]>();
  if (workerIds.length === 0) return map;
  const { data, error } = await supabase
    .from("company_delivery_worker_zones")
    .select("worker_id, delivery_zone_id, company_delivery_zones(id, governorate, zone_name)")
    .in("worker_id", workerIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const workerId = String(row.worker_id);
    const zoneJoin = row.company_delivery_zones as
      | { id?: string; governorate?: string; zone_name?: string }
      | { id?: string; governorate?: string; zone_name?: string }[]
      | null;
    const zone = Array.isArray(zoneJoin) ? zoneJoin[0] : zoneJoin;
    const zoneId = zone?.id ? String(zone.id) : String(row.delivery_zone_id);
    const governorate = String(zone?.governorate ?? "").trim();
    const zoneName = String(zone?.zone_name ?? "").trim();
    const label = [governorate, zoneName].filter(Boolean).join(" · ") || zoneId;
    const list = map.get(workerId) ?? [];
    list.push({ id: zoneId, label });
    map.set(workerId, list);
  }
  return map;
}

async function replaceWorkerZones(workerId: string, zoneIds: string[]) {
  const { error: delError } = await supabase
    .from("company_delivery_worker_zones")
    .delete()
    .eq("worker_id", workerId);
  if (delError) throw new Error(delError.message);
  const unique = [...new Set(zoneIds.filter(Boolean))];
  if (unique.length === 0) return;
  const { error: insError } = await supabase.from("company_delivery_worker_zones").insert(
    unique.map((delivery_zone_id) => ({ worker_id: workerId, delivery_zone_id })),
  );
  if (insError) throw new Error(insError.message);
}

export function useCompanyDeliveryWorkers(companyId: string | null) {
  return useQuery({
    queryKey: companyDeliveryWorkersKey(companyId),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<CompanyDeliveryWorkerFormValues[]> => {
      if (!companyId) throw new Error("Company required");
      const { data, error } = await supabase
        .from("company_delivery_workers")
        .select("*")
        .eq("company_id", companyId)
        .order("full_name", { ascending: true });
      if (error) throw workersReadError(error.message);
      const rows = (data ?? []) as CompanyDeliveryWorkerRow[];
      const zoneMap = await loadZonesForWorkers(rows.map((row) => row.id));
      return rows.map((row) => normalizeDeliveryWorker(row, zoneMap.get(row.id) ?? []));
    },
  });
}

export function useSaveCompanyDeliveryWorker(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: CompanyDeliveryWorkerFormValues) => {
      if (!companyId) throw new Error("Company required");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const validationError = validateDeliveryWorker(values);
      if (validationError) throw new Error(validationError);

      if (values.id) {
        const { data, error } = await supabase
          .from("company_delivery_workers")
          .update(deliveryWorkerToUpdate(values))
          .eq("id", values.id)
          .eq("company_id", companyId)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        await replaceWorkerZones(values.id, values.zoneIds);
        return normalizeDeliveryWorker(data as CompanyDeliveryWorkerRow, values.zoneLabels);
      }

      const { data, error } = await supabase
        .from("company_delivery_workers")
        .insert(deliveryWorkerToInsert(companyId, values))
        .select("*")
        .single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) throw new Error("worker_phone_duplicate");
        throw new Error(error.message);
      }
      const row = data as CompanyDeliveryWorkerRow;
      await replaceWorkerZones(row.id, values.zoneIds);
      return normalizeDeliveryWorker(row, values.zoneLabels);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyDeliveryWorkersKey(companyId) });
    },
  });
}

export function useToggleCompanyDeliveryWorkerActive(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { workerId: string; isActive: boolean }) => {
      if (!companyId) throw new Error("Company required");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("company_delivery_workers")
        .update({ is_active: input.isActive === true, updated_at: new Date().toISOString() })
        .eq("id", input.workerId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyDeliveryWorkersKey(companyId) });
    },
  });
}

export function useDeleteCompanyDeliveryWorker(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (workerId: string) => {
      if (!companyId) throw new Error("Company required");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("company_delivery_workers")
        .delete()
        .eq("id", workerId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyDeliveryWorkersKey(companyId) });
    },
  });
}

export function useDeliveryWorkersForZone(companyId: string | null, zoneId: string | null) {
  const all = useCompanyDeliveryWorkers(companyId);
  const workers =
    all.data?.filter(
      (worker) => worker.isActive && Boolean(zoneId) && worker.zoneIds.includes(zoneId!),
    ) ?? [];
  return { ...all, workers };
}
