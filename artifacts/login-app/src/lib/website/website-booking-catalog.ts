import { supabase } from "@/lib/supabase";

export type WebsiteBookingBranch = {
  id: string;
  name: string;
  line: string;
};

export type WebsiteBookingOffer = {
  branchId: string;
  serviceId: string;
  resourceId: string;
};

export type WebsiteBookingCatalog = {
  branches: WebsiteBookingBranch[];
  offers: WebsiteBookingOffer[];
};

function lineFrom(address: unknown, city: unknown, country: unknown, name: unknown): string {
  const parts = [address, city, country].map((part) => (typeof part === "string" ? part.trim() : "")).filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return typeof name === "string" ? name.trim() : "";
}

/** Services a branch actually offers through a resource assigned to that branch. */
export { serviceIdsForBranch } from "@/lib/website/website-branch-services";

function parseCatalog(value: unknown): WebsiteBookingCatalog {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const branches = (Array.isArray(source.branches) ? source.branches : []).flatMap((row) => {
    const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const id = typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!id || !name) return [];
    return [{ id, name, line: lineFrom(item.address, item.city, item.country, name) }];
  });
  const offers = (Array.isArray(source.offers) ? source.offers : []).flatMap((row) => {
    const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const branchId = typeof item.branchId === "string" ? item.branchId : "";
    const serviceId = typeof item.serviceId === "string" ? item.serviceId : "";
    const resourceId = typeof item.resourceId === "string" ? item.resourceId : "";
    if (!branchId || !serviceId || !resourceId) return [];
    return [{ branchId, serviceId, resourceId }];
  });
  return { branches, offers };
}

async function loadCatalogDirect(companyId: string): Promise<WebsiteBookingCatalog> {
  const { data: branchRows, error: branchError } = await supabase
    .from("branches")
    .select("id, name, address_line1, city, country, is_primary")
    .eq("company_id", companyId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .order("name");
  if (branchError) throw new Error(branchError.message);

  const { data: resources, error: resourceError } = await supabase
    .from("scheduling_resources")
    .select("id, branch_id")
    .eq("company_id", companyId)
    .eq("status", "active")
    .is("deleted_at", null)
    .not("branch_id", "is", null);
  if (resourceError) throw new Error(resourceError.message);

  const resourceIds = (resources ?? []).map((row) => row.id as string);
  let offers: WebsiteBookingOffer[] = [];
  if (resourceIds.length) {
    const { data: caps, error: capError } = await supabase
      .from("resource_services")
      .select("resource_id, service_id")
      .in("resource_id", resourceIds)
      .is("deleted_at", null);
    if (capError) throw new Error(capError.message);
    const branchByResource = new Map((resources ?? []).map((row) => [row.id as string, row.branch_id as string]));
    offers = (caps ?? []).flatMap((row) => {
      const branchId = branchByResource.get(row.resource_id as string) ?? "";
      const serviceId = row.service_id as string;
      const resourceId = row.resource_id as string;
      if (!branchId || !serviceId) return [];
      return [{ branchId, serviceId, resourceId }];
    });
  }

  return {
    branches: (branchRows ?? []).map((row) => ({
      id: row.id as string,
      name: String(row.name ?? "").trim(),
      line: lineFrom(row.address_line1, row.city, row.country, row.name),
    })).filter((row) => row.id && row.name),
    offers,
  };
}

export async function loadWebsiteBookingCatalog(companyId: string): Promise<WebsiteBookingCatalog> {
  const rpc = await supabase.rpc("website_booking_catalog", { p_company_id: companyId });
  if (!rpc.error && rpc.data) {
    const parsed = parseCatalog(rpc.data);
    if (parsed.branches.length > 0) return parsed;
  }
  return loadCatalogDirect(companyId);
}
