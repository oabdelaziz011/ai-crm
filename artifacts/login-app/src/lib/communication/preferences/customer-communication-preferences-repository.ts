import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerCommunicationPreferences } from "@/lib/communication/types";

type PreferenceRow = {
  customer_id: string;
  company_id: string;
  receive_whatsapp: boolean;
  receive_email: boolean;
  receive_sms: boolean;
  receive_marketing: boolean;
  language: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
};

function mapRow(row: PreferenceRow): CustomerCommunicationPreferences {
  return {
    customerId: row.customer_id,
    companyId: row.company_id,
    receiveWhatsapp: row.receive_whatsapp,
    receiveEmail: row.receive_email,
    receiveSms: row.receive_sms,
    receiveMarketing: row.receive_marketing,
    language: row.language,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    timezone: row.timezone,
  };
}

const DEFAULT_PREFS = (customerId: string, companyId: string): CustomerCommunicationPreferences => ({
  customerId,
  companyId,
  receiveWhatsapp: true,
  receiveEmail: true,
  receiveSms: true,
  receiveMarketing: false,
  language: "en",
  quietHoursStart: null,
  quietHoursEnd: null,
  timezone: "UTC",
});

export class CustomerCommunicationPreferencesRepository {
  constructor(private readonly client: SupabaseClient) {}

  async get(customerId: string, companyId: string): Promise<CustomerCommunicationPreferences> {
    const { data, error } = await this.client
      .from("customer_communication_preferences")
      .select("*")
      .eq("customer_id", customerId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return DEFAULT_PREFS(customerId, companyId);
    return mapRow(data as PreferenceRow);
  }

  async upsert(prefs: CustomerCommunicationPreferences): Promise<CustomerCommunicationPreferences> {
    const { data, error } = await this.client
      .from("customer_communication_preferences")
      .upsert(
        {
          customer_id: prefs.customerId,
          company_id: prefs.companyId,
          receive_whatsapp: prefs.receiveWhatsapp,
          receive_email: prefs.receiveEmail,
          receive_sms: prefs.receiveSms,
          receive_marketing: prefs.receiveMarketing,
          language: prefs.language,
          quiet_hours_start: prefs.quietHoursStart,
          quiet_hours_end: prefs.quietHoursEnd,
          timezone: prefs.timezone,
        },
        { onConflict: "company_id,customer_id" },
      )
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapRow(data as PreferenceRow);
  }
}
