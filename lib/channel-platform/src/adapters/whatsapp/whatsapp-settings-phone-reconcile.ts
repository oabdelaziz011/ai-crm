import type { SupabaseClient } from "@supabase/supabase-js";

export type ReconcileWhatsAppPhoneNumberIdInput = {
  client: SupabaseClient;
  companyId: string;
  companyChannelId: string;
  phoneNumberId: string;
  /** Optional WABA id when known from Graph; left untouched when omitted. */
  businessAccountId?: string | null;
  syncChannelPhoneNumberId: (companyChannelId: string, phoneNumberId: string) => Promise<void>;
};

export type ReconcileWhatsAppPhoneNumberIdResult = {
  companyId: string;
  companyChannelId: string;
  phoneNumberId: string;
  settingsUpdated: boolean;
  previousSettingsPhoneNumberId: string | null;
  channelsSynced: boolean;
};

/**
 * Keep canonical company_whatsapp_settings + company_channels.configuration in sync
 * when Meta delivers a phone_number_id that the company's token can access.
 *
 * Without this, inbound probe updates only the channel row; a later settings upsert
 * (or outbound via settings-only paths) reverts / diverges from the live Meta number.
 */
export async function reconcileCompanyWhatsAppPhoneNumberId(
  input: ReconcileWhatsAppPhoneNumberIdInput,
): Promise<ReconcileWhatsAppPhoneNumberIdResult> {
  const phoneNumberId = input.phoneNumberId.trim();
  if (!phoneNumberId) {
    throw new Error("phoneNumberId is required for WhatsApp reconciliation");
  }

  await input.syncChannelPhoneNumberId(input.companyChannelId, phoneNumberId);

  const { data: settingsRow, error: settingsReadError } = await input.client
    .from("company_whatsapp_settings")
    .select("phone_number_id, business_account_id")
    .eq("company_id", input.companyId)
    .maybeSingle();

  if (settingsReadError) {
    throw settingsReadError;
  }

  const previousSettingsPhoneNumberId =
    typeof settingsRow?.phone_number_id === "string" && settingsRow.phone_number_id.trim()
      ? settingsRow.phone_number_id.trim()
      : null;

  const patch: Record<string, string> = {};
  if (previousSettingsPhoneNumberId !== phoneNumberId) {
    patch.phone_number_id = phoneNumberId;
  }

  const nextWaba =
    typeof input.businessAccountId === "string" ? input.businessAccountId.trim() : "";
  if (nextWaba) {
    const previousWaba =
      typeof settingsRow?.business_account_id === "string"
        ? settingsRow.business_account_id.trim()
        : "";
    if (previousWaba !== nextWaba) {
      patch.business_account_id = nextWaba;
    }
  }

  let settingsUpdated = false;
  if (Object.keys(patch).length > 0) {
    if (settingsRow) {
      const { error: updateError } = await input.client
        .from("company_whatsapp_settings")
        .update(patch)
        .eq("company_id", input.companyId);
      if (updateError) throw updateError;
      settingsUpdated = true;
    } else {
      // Settings row missing — create a minimal shell so channel sync has a source of truth.
      // Secrets must still be entered via Settings UI / upsert RPC.
      const { error: insertError } = await input.client.from("company_whatsapp_settings").insert({
        company_id: input.companyId,
        enabled: true,
        provider: "meta_cloud",
        phone_number_id: phoneNumberId,
        business_account_id: nextWaba || "",
        access_token: "",
        webhook_verify_token: "",
        default_language: "en",
        max_retry_count: 3,
        api_version: "v21.0",
      });
      if (insertError) throw insertError;
      settingsUpdated = true;
    }
  }

  const { error: syncError } = await input.client.rpc("sync_whatsapp_channel_references", {
    p_company_id: input.companyId,
  });
  if (syncError) throw syncError;

  return {
    companyId: input.companyId,
    companyChannelId: input.companyChannelId,
    phoneNumberId,
    settingsUpdated,
    previousSettingsPhoneNumberId,
    channelsSynced: true,
  };
}
