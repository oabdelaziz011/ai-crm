import { supabase } from "@/lib/supabase";

export type WebsiteServicePricingRule = {
  id: string;
  code: string;
  label: string;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  isDefault: boolean;
};

function parseRules(value: unknown): WebsiteServicePricingRule[] {
  return (Array.isArray(value) ? value : []).flatMap((row) => {
    const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const id = typeof item.id === "string" ? item.id : "";
    const code = typeof item.code === "string" ? item.code.trim() : "";
    if (!id || !code) return [];
    const priceCents = Number(item.priceCents);
    const durationMinutes = Number(item.durationMinutes);
    return [{
      id,
      code,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : code,
      priceCents: Number.isFinite(priceCents) ? priceCents : 0,
      currency: typeof item.currency === "string" && item.currency.trim() ? item.currency.trim().toUpperCase() : "USD",
      durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30,
      isDefault: item.isDefault === true,
    }];
  });
}

async function loadPricingDirect(companyId: string, serviceId: string): Promise<WebsiteServicePricingRule[]> {
  const { data, error } = await supabase
    .from("scheduling_service_pricing_rules")
    .select("id, price_cents, currency, duration_minutes, is_default, type:scheduling_pricing_rule_types!type_id(code, label)")
    .eq("company_id", companyId)
    .eq("service_id", serviceId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) => {
    const type = row.type && typeof row.type === "object" ? (row.type as { code?: string; label?: string }) : {};
    const code = typeof type.code === "string" ? type.code.trim() : "";
    if (!row.id || !code) return [];
    return [{
      id: row.id as string,
      code,
      label: typeof type.label === "string" && type.label.trim() ? type.label.trim() : code,
      priceCents: Number(row.price_cents) || 0,
      currency: String(row.currency || "USD").toUpperCase(),
      durationMinutes: Number(row.duration_minutes) > 0 ? Number(row.duration_minutes) : 30,
      isDefault: row.is_default === true,
    }];
  });
}

export async function loadWebsiteServicePricing(
  companyId: string,
  serviceId: string,
): Promise<WebsiteServicePricingRule[]> {
  const rpc = await supabase.rpc("website_service_pricing", {
    p_company_id: companyId,
    p_service_id: serviceId,
  });
  if (!rpc.error) {
    const parsed = parseRules(rpc.data);
    if (parsed.length > 0) return parsed;
  }
  return loadPricingDirect(companyId, serviceId);
}
