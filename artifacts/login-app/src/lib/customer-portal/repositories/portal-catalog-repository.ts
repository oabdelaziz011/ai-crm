import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompanyCurrency } from "@/lib/company-locale/runtime";
import type { PortalResourceView, PortalServiceView } from "@/lib/customer-portal/types";

export class PortalCatalogRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listServices(companyId: string): Promise<PortalServiceView[]> {
    const { data, error } = await this.client
      .from("scheduling_services")
      .select("id, name, description, duration_minutes, price_cents, currency")
      .eq("company_id", companyId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name");

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      durationMinutes: row.duration_minutes,
      priceCents: Number(row.price_cents) || 0,
      currency: row.currency || getCompanyCurrency(),
    }));
  }

  async listResources(companyId: string, serviceId?: string): Promise<PortalResourceView[]> {
    const { data, error } = await this.client
      .from("scheduling_resources")
      .select("id, name, resource_type, metadata")
      .eq("company_id", companyId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name");

    if (error) throw new Error(error.message);

    const resources = (data ?? []).map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        name: row.name,
        type: row.resource_type,
        specialty: (meta.specialty as string) ?? null,
        experienceYears: (meta.experienceYears as number) ?? null,
        profileImageUrl: (meta.profileImageUrl as string) ?? null,
        rating: (meta.rating as number) ?? null,
        bio: (meta.bio as string) ?? null,
      };
    });

    if (!serviceId) return resources;

    const { data: caps } = await this.client
      .from("resource_services")
      .select("resource_id")
      .eq("service_id", serviceId)
      .is("deleted_at", null);

    const allowed = new Set((caps ?? []).map((c) => c.resource_id));
    return resources.filter((r) => allowed.has(r.id));
  }
}
