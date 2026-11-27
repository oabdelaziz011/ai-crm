/**
 * Company delivery workers (external name + phone) mapped to delivery zones.
 */

export type CompanyDeliveryWorkerZoneLabel = {
  id: string;
  label: string;
};

export type CompanyDeliveryWorkerFormValues = {
  id?: string;
  fullName: string;
  phoneE164: string;
  isActive: boolean;
  zoneIds: string[];
  zoneLabels: CompanyDeliveryWorkerZoneLabel[];
};

export const DEFAULT_DELIVERY_WORKER_FORM: CompanyDeliveryWorkerFormValues = {
  fullName: "",
  phoneE164: "",
  isActive: true,
  zoneIds: [],
  zoneLabels: [],
};

export type CompanyDeliveryWorkerRow = {
  id: string;
  company_id: string;
  full_name: string;
  phone_e164: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  zone_ids?: string[] | null;
};

export function normalizeDeliveryWorker(
  row: CompanyDeliveryWorkerRow,
  zones: CompanyDeliveryWorkerZoneLabel[] = [],
): CompanyDeliveryWorkerFormValues {
  const zoneLabels = zones.filter((zone) => zone.id);
  return {
    id: row.id,
    fullName: String(row.full_name ?? "").trim(),
    phoneE164: String(row.phone_e164 ?? "").trim(),
    isActive: row.is_active !== false,
    zoneIds: zoneLabels.map((zone) => zone.id),
    zoneLabels,
  };
}

export function validateDeliveryWorker(values: CompanyDeliveryWorkerFormValues): string | null {
  if (!values.fullName?.trim()) return "full_name_required";
  if (!values.phoneE164?.trim()) return "phone_required";
  if (!/^\+[1-9]\d{6,14}$/.test(values.phoneE164.trim())) return "phone_invalid";
  return null;
}

export function deliveryWorkerToInsert(companyId: string, values: CompanyDeliveryWorkerFormValues) {
  return {
    company_id: companyId,
    full_name: values.fullName.trim(),
    phone_e164: values.phoneE164.trim(),
    is_active: values.isActive !== false,
    updated_at: new Date().toISOString(),
  };
}

export function deliveryWorkerToUpdate(values: CompanyDeliveryWorkerFormValues) {
  return {
    full_name: values.fullName.trim(),
    phone_e164: values.phoneE164.trim(),
    is_active: values.isActive !== false,
    updated_at: new Date().toISOString(),
  };
}
