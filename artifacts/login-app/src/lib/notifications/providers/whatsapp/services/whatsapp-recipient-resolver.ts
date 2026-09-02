import type { SupabaseClient } from "@supabase/supabase-js";
import { checkWhatsAppOptIn } from "@/lib/notifications/providers/whatsapp/services/whatsapp-phone-validator";
import {
  prepareWhatsAppRecipientPhoneInput,
  resolveWhatsAppOutboundPhone,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-outbound-phone";
import type {
  RecipientOptInStatus,
  RecipientPhoneValidation,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

export type ResolvedWhatsAppRecipient = {
  phone: string | null;
  validation: RecipientPhoneValidation;
  optIn: RecipientOptInStatus;
  /** D5.1: which identity produced the outbound destination. */
  phoneSource?:
    | "phone_e164"
    | "legacy_phone"
    | "explicit_e164"
    | "explicit_resolved"
    | "params"
    | null;
};

/** Re-export for existing imports (Egypt compat helper — not generic outbound). */
export { prepareWhatsAppRecipientPhoneInput } from "@/lib/notifications/providers/whatsapp/services/whatsapp-outbound-phone";

type CustomerPhoneRow = {
  phone: string | null;
  phone_e164: string | null;
  company_id?: string | null;
};

/**
 * Load customer phone identity for outbound.
 * When companyId is provided, lookup is tenant-scoped (company_id + id).
 * Prefers phone_e164; falls back to legacy phone. Read-only — no UPDATEs.
 */
async function fetchCustomerOutboundPhoneFields(
  client: SupabaseClient,
  customerId: string,
  companyId?: string | null,
): Promise<CustomerPhoneRow | null> {
  let query = client
    .from("customers")
    .select("phone, phone_e164, company_id")
    .eq("id", customerId);

  if (companyId?.trim()) {
    query = query.eq("company_id", companyId.trim());
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as CustomerPhoneRow;
}

function toRecipient(
  resolved: ReturnType<typeof resolveWhatsAppOutboundPhone>,
  optIn: RecipientOptInStatus,
  phoneSourceOverride?: ResolvedWhatsAppRecipient["phoneSource"],
): ResolvedWhatsAppRecipient {
  if (resolved.ok) {
    return {
      phone: resolved.phone,
      validation: { valid: true, normalized: resolved.phone },
      optIn,
      phoneSource: phoneSourceOverride ?? resolved.source,
    };
  }
  return {
    phone: null,
    validation: {
      valid: false,
      normalized: null,
      error: resolved.reason,
    },
    optIn,
    phoneSource: phoneSourceOverride ?? resolved.source,
  };
}

/**
 * D5.1 / D5.4 queue / worker recipient resolution.
 *
 * Precedence:
 * 1. canonical customer.phone_e164 (ALWAYS wins)
 * 2. explicitly supplied phoneE164 / phone_e164 params
 * 3. CRM legacy phone via resolvePhoneIdentity (when CRM has phone but no e164)
 * 4. params.phone only when CRM has no phone and safely resolvable
 * 5. fail closed
 *
 * Never let params.phone override CRM phone_e164 or silently replace CRM legacy
 * (unresolved CRM legacy fails closed; use explicit phoneE164 for intentional override).
 */
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
      phoneSource: null,
    };
  }

  const customerId = params.customerId?.trim() || params.customer_id?.trim() || null;
  const companyId = params.companyId?.trim() || params.company_id?.trim() || null;

  let customerRow: CustomerPhoneRow | null = null;
  if (customerId) {
    customerRow = await fetchCustomerOutboundPhoneFields(client, customerId, companyId);
    if (companyId && customerRow && customerRow.company_id && customerRow.company_id !== companyId) {
      return {
        phone: null,
        validation: {
          valid: false,
          normalized: null,
          error: "cross_company_customer",
        },
        optIn,
        phoneSource: null,
      };
    }
  }

  // 1) Canonical CRM phone_e164 always wins when present.
  const crmE164 = customerRow?.phone_e164?.trim() || null;
  if (crmE164) {
    return toRecipient(
      resolveWhatsAppOutboundPhone({
        phone_e164: crmE164,
        phone: customerRow?.phone,
        companyId,
        customerId,
      }),
      optIn,
      "phone_e164",
    );
  }

  // 2) Explicit E.164 in params.
  const paramE164 =
    params.phoneE164?.trim() ||
    params.phone_e164?.trim() ||
    null;
  if (paramE164) {
    return toRecipient(
      resolveWhatsAppOutboundPhone({ phoneE164: paramE164, companyId, customerId }),
      optIn,
      "explicit_e164",
    );
  }

  // 3) CRM legacy phone (no e164) via canonical resolver — before params.phone.
  // If CRM has a legacy phone that does not resolve, fail closed: do NOT let
  // params.phone silently replace the CRM identity (even when unresolved).
  if (customerRow?.phone?.trim()) {
    return toRecipient(
      resolveWhatsAppOutboundPhone({
        phone: customerRow.phone,
        companyId,
        customerId,
      }),
      optIn,
      "legacy_phone",
    );
  }

  // 4) params.phone — only when CRM has no phone/e164. E.164 / + explicit region.
  const paramPhone =
    params.phone?.trim() ||
    params.recipientPhone?.trim() ||
    params.recipient_phone?.trim() ||
    null;
  const paramRegion =
    params.phoneRegion?.trim() ||
    params.phone_region?.trim() ||
    params.region?.trim() ||
    null;

  if (paramPhone) {
    return toRecipient(
      resolveWhatsAppOutboundPhone({
        phone: paramPhone,
        region: paramRegion,
        companyId,
        customerId,
      }),
      optIn,
      paramRegion ? "explicit_resolved" : "params",
    );
  }

  // 5) Fail closed.
  return {
    phone: null,
    validation: { valid: false, normalized: null, error: "missing_phone" },
    optIn,
    phoneSource: null,
  };
}
