import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalProfileView } from "@/lib/customer-portal/types";

export class PortalProfileService {
  constructor(private readonly client: SupabaseClient) {}

  async get(companyId: string, customerId: string): Promise<PortalProfileView> {
    const { data, error } = await this.client
      .from("customers")
      .select("id, name, email, phone")
      .eq("id", customerId)
      .maybeSingle();

    if (error || !data) throw new Error("Customer not found");

    const { data: prefs } = await this.client
      .from("customer_communication_preferences")
      .select("language, receive_marketing")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .maybeSingle();

    const { data: portalPrefs } = await this.client
      .from("customer_portal_profiles")
      .select("emergency_contact")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .maybeSingle();

    return {
      customerId: data.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      preferredLanguage: prefs?.language ?? "en",
      marketingConsent: prefs?.receive_marketing ?? false,
      emergencyContact: portalPrefs?.emergency_contact ?? null,
    };
  }
}
