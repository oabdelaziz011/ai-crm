import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalBranding, PortalPublicProfile } from "@/lib/customer-portal/types";

type PortalSettingsRow = {
  company_id: string;
  slug: string;
  enabled: boolean;
  description: string | null;
  timezone: string;
  branding: PortalBranding;
  working_hours: Record<string, { open: string; close: string } | null>;
  location: PortalPublicProfile["location"];
  companies?: { name: string; logo_url: string | null };
};

function mapProfile(row: PortalSettingsRow): PortalPublicProfile {
  return {
    companyId: row.company_id,
    slug: row.slug,
    name: row.companies?.name ?? row.slug,
    description: row.description,
    timezone: row.timezone,
    enabled: row.enabled,
    branding: {
      logoUrl: row.branding?.logoUrl ?? row.companies?.logo_url ?? null,
      coverImageUrl: row.branding?.coverImageUrl ?? null,
      primaryColor: row.branding?.primaryColor ?? "#6366f1",
      secondaryColor: row.branding?.secondaryColor ?? "#8b5cf6",
      fontFamily: row.branding?.fontFamily ?? "Inter, sans-serif",
      faviconUrl: row.branding?.faviconUrl ?? null,
      darkMode: row.branding?.darkMode ?? false,
      customDomain: row.branding?.customDomain ?? null,
    },
    workingHours: row.working_hours ?? {},
    location: row.location ?? { address: null, city: null, country: null, lat: null, lng: null },
  };
}

export class PortalSettingsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getBySlug(slug: string): Promise<PortalPublicProfile | null> {
    const { data, error } = await this.client
      .from("customer_portal_settings")
      .select("*, companies(name, logo_url)")
      .eq("slug", slug)
      .eq("enabled", true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapProfile(data as PortalSettingsRow);
  }

  async getByCompanyId(companyId: string): Promise<PortalPublicProfile | null> {
    const { data, error } = await this.client
      .from("customer_portal_settings")
      .select("*, companies(name, logo_url)")
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapProfile(data as PortalSettingsRow);
  }
}
