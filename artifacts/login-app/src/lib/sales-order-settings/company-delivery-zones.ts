/**
 * Company delivery zones for AI order collection (settings phase only).
 * Zones are company-authored; no hardcoded governorates or invented ETAs.
 */

export const DELIVERY_ETA_UNITS = ["hours", "days"] as const;
export type DeliveryEtaUnit = (typeof DELIVERY_ETA_UNITS)[number];

export type CompanyDeliveryZoneFormValues = {
  id?: string;
  governorate: string;
  zoneName: string;
  enabled: boolean;
  deliveryFee: number;
  etaMin: number;
  etaMax: number;
  etaUnit: DeliveryEtaUnit;
};

export const DEFAULT_DELIVERY_ZONE_FORM: CompanyDeliveryZoneFormValues = {
  governorate: "",
  zoneName: "",
  enabled: true,
  deliveryFee: 0,
  etaMin: 1,
  etaMax: 3,
  etaUnit: "days",
};

export type CompanyDeliveryZoneRow = {
  id: string;
  company_id: string;
  governorate: string;
  zone_name: string;
  enabled: boolean;
  delivery_fee: number | string;
  eta_min: number;
  eta_max: number;
  eta_unit: string;
  created_at?: string;
  updated_at?: string;
};

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeDeliveryZone(row: CompanyDeliveryZoneRow): CompanyDeliveryZoneFormValues {
  const unit = String(row.eta_unit ?? "days");
  return {
    id: row.id,
    governorate: String(row.governorate ?? "").trim(),
    zoneName: String(row.zone_name ?? "").trim(),
    enabled: row.enabled !== false,
    deliveryFee: Math.max(0, toFiniteNumber(row.delivery_fee, 0)),
    etaMin: Math.max(1, Math.floor(toFiniteNumber(row.eta_min, 1))),
    etaMax: Math.max(1, Math.floor(toFiniteNumber(row.eta_max, 1))),
    etaUnit: unit === "hours" ? "hours" : "days",
  };
}

export function validateDeliveryZone(values: CompanyDeliveryZoneFormValues): string | null {
  if (!values.governorate?.trim()) return "governorate_required";
  if (!values.zoneName?.trim()) return "zone_name_required";
  if (!Number.isFinite(values.deliveryFee) || values.deliveryFee < 0) return "delivery_fee_invalid";
  if (!Number.isFinite(values.etaMin) || values.etaMin < 1) return "eta_min_invalid";
  if (!Number.isFinite(values.etaMax) || values.etaMax < 1) return "eta_max_invalid";
  if (values.etaMin > values.etaMax) return "eta_min_exceeds_max";
  if (!(DELIVERY_ETA_UNITS as readonly string[]).includes(values.etaUnit)) return "eta_unit_invalid";
  return null;
}

export function deliveryZoneToInsert(companyId: string, values: CompanyDeliveryZoneFormValues) {
  const etaMin = Math.max(1, Math.floor(values.etaMin));
  const etaMax = Math.max(etaMin, Math.floor(values.etaMax));
  return {
    company_id: companyId,
    governorate: values.governorate.trim(),
    zone_name: values.zoneName.trim(),
    enabled: values.enabled !== false,
    delivery_fee: Math.max(0, Number(values.deliveryFee) || 0),
    eta_min: etaMin,
    eta_max: etaMax,
    eta_unit: values.etaUnit === "hours" ? "hours" : "days",
    updated_at: new Date().toISOString(),
  };
}

export function deliveryZoneToUpdate(values: CompanyDeliveryZoneFormValues) {
  const etaMin = Math.max(1, Math.floor(values.etaMin));
  const etaMax = Math.max(etaMin, Math.floor(values.etaMax));
  return {
    governorate: values.governorate.trim(),
    zone_name: values.zoneName.trim(),
    enabled: values.enabled !== false,
    delivery_fee: Math.max(0, Number(values.deliveryFee) || 0),
    eta_min: etaMin,
    eta_max: etaMax,
    eta_unit: values.etaUnit === "hours" ? "hours" : "days",
    updated_at: new Date().toISOString(),
  };
}
