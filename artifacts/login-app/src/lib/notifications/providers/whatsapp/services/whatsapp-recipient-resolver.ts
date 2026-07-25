import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkWhatsAppOptIn,
  validateRecipientPhone,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-phone-validator";
import type {
  RecipientOptInStatus,
  RecipientPhoneValidation,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

export type ResolvedWhatsAppRecipient = {
  phone: string | null;
  validation: RecipientPhoneValidation;
  optIn: RecipientOptInStatus;
};

async function fetchCustomerPhone(
  client: SupabaseClient,
  customerId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("customers")
    .select("phone")
    .eq("id", customerId)
    .maybeSingle();

  if (error || !data?.phone) return null;
  return data.phone.trim();
}

export async function resolveRecipientPhone(
  client: SupabaseClient,
  params: Record<string, string>,
): Promise<ResolvedWhatsAppRecipient> {
  const optIn = checkWhatsAppOptIn(params);
  if (!optIn.optedIn) {
    return {
      phone: null,
      validation: { valid: false, normalized: null, error: optIn.reason ?? "opt_out" },
      optIn,
    };
  }

  let raw: string | null =
    params.phone?.trim() ||
    params.recipientPhone?.trim() ||
    params.recipient_phone?.trim() ||
    null;

  if (!raw && params.customerId?.trim()) {
    raw = await fetchCustomerPhone(client, params.customerId.trim());
  }

  if (!raw && params.customer_id?.trim()) {
    raw = await fetchCustomerPhone(client, params.customer_id.trim());
  }

  const validation = validateRecipientPhone(raw);
  return {
    phone: validation.normalized,
    validation,
    optIn,
  };
}
