/**
 * Explicit admin-confirmed WhatsApp identity overrides.
 *
 * Used only when CRM phone lookup finds multiple customers for the same
 * sender variants. The override customer MUST already be among the phone
 * matches — never invents identity, never merges/deletes CRM rows.
 *
 * Welcome display names are customer-id scoped (not global string hardcodes).
 */

import { normalizeEgyptMobilePhone } from "./customer-phone-normalization.js";

/** Company-scoped: WhatsApp Meta `from` → trusted CRM customer_id. */
export const WHATSAPP_SENDER_TRUSTED_CUSTOMER_OVERRIDES: ReadonlyArray<{
  companyId: string;
  /** Any Egypt-mobile form (e.g. 2010… / 010…). */
  senderDigits: string;
  customerId: string;
}> = [
  {
    companyId: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
    senderDigits: "201011404109",
    customerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
  },
];

/**
 * Customer-id scoped welcome display name.
 * Does not mutate CRM `customers.name`; only affects trusted welcome personalization.
 */
export const TRUSTED_CUSTOMER_WELCOME_DISPLAY_NAME_OVERRIDES: Readonly<
  Record<string, string>
> = {
  "8b810114-c2fe-4a30-bc65-cf4bf084d1fb": "عمر عبدالعزيز",
};

export function lookupWhatsAppSenderTrustedCustomerOverride(input: {
  companyId: string;
  senderExternalId: string;
}): string | null {
  const companyId = input.companyId.trim();
  const sender = input.senderExternalId.trim();
  if (!companyId || !sender) return null;

  const senderNorm = normalizeEgyptMobilePhone(sender);
  if (!senderNorm) return null;

  for (const row of WHATSAPP_SENDER_TRUSTED_CUSTOMER_OVERRIDES) {
    if (row.companyId !== companyId) continue;
    const overrideNorm = normalizeEgyptMobilePhone(row.senderDigits);
    if (overrideNorm && overrideNorm === senderNorm) {
      return row.customerId;
    }
  }
  return null;
}

/** Prefer customer-id-scoped welcome display name over raw CRM name. */
export function resolveTrustedCustomerWelcomeDisplayName(
  customerId: string,
  crmName: string | null | undefined,
): string {
  const id = customerId.trim();
  const override = id ? TRUSTED_CUSTOMER_WELCOME_DISPLAY_NAME_OVERRIDES[id] : undefined;
  if (typeof override === "string" && override.trim()) return override.trim();
  return typeof crmName === "string" ? crmName.trim() : "";
}
