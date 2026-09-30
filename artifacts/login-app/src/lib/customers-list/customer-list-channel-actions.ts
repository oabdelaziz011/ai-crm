/**
 * Which outbound channels the Customers list actions menu may offer.
 * Commercial entitlement + module RBAC + company channel/settings actually on.
 */

export type CustomerListChannelCapabilities = {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
};

export function resolveCustomerListChannelCapabilities(input: {
  isSuperAdmin: boolean;
  commercialFeatureEnabled: (featureCode: string) => boolean | undefined;
  hasPermission: (code: string) => boolean;
  /** Company WhatsApp settings / channel currently enabled (fail closed while unknown). */
  whatsappEnabledInCompany?: boolean | null;
  /** Company SMS settings currently enabled. */
  smsEnabledInCompany?: boolean | null;
  /** Company Email workspace channel currently enabled. */
  emailEnabledInCompany?: boolean | null;
}): CustomerListChannelCapabilities {
  const entitled = (featureCode: string) =>
    input.isSuperAdmin || input.commercialFeatureEnabled(featureCode) === true;

  const canAny = (codes: readonly string[]) =>
    input.isSuperAdmin || codes.some((code) => input.hasPermission(code));

  const companyOn = (flag: boolean | null | undefined) => flag === true;

  return {
    email:
      entitled("email_channel") &&
      canAny(["email.view"]) &&
      companyOn(input.emailEnabledInCompany),
    sms:
      entitled("sms_channel") &&
      canAny(["sms.view"]) &&
      companyOn(input.smsEnabledInCompany),
    whatsapp:
      entitled("whatsapp_channel") &&
      canAny(["whatsapp.view", "channels.view"]) &&
      companyOn(input.whatsappEnabledInCompany),
  };
}

/** Tags shown in the Tags column — Notes + VIP sit next to the customer name. */
export const CUSTOMER_LIST_DISPLAY_TAGS = ["whatsapp", "email", "sms"] as const;

export type CustomerListDisplayTag = (typeof CUSTOMER_LIST_DISPLAY_TAGS)[number];

export function customerListDisplayTags(tags: string[]): CustomerListDisplayTag[] {
  return CUSTOMER_LIST_DISPLAY_TAGS.filter((tag) => tags.includes(tag));
}

/** Prefer E.164 when present — same identity WhatsApp/SMS outbound use. */
export function customerListOutboundPhone(customer: {
  phone?: string | null;
  phone_e164?: string | null;
}): string | null {
  const e164 = customer.phone_e164?.trim();
  if (e164) return e164;
  const phone = customer.phone?.trim();
  return phone || null;
}

/** Open Email Workspace compose prefilled with this recipient. */
export function customerListEmailComposeHref(recipientEmail: string): string {
  const params = new URLSearchParams();
  params.set("compose", String(Date.now()));
  params.set("to", recipientEmail.trim());
  return `~/dashboard/email?${params.toString()}`;
}
