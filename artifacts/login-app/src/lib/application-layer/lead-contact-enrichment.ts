import type { LeadReadModel } from "@workspace/application-layer";
import { isPlaceholderContactName } from "@workspace/lead-platform";

/** Company-scoped customer contact fields used to fill blank lead list cells. */
export type CustomerContactSnapshot = {
  id: string;
  name: string | null;
  email: string | null;
  /** Prefer legacy `phone`, then canonical `phone_e164`. */
  phone: string | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Fill blank contact columns from the linked customer only.
 * Never overwrites non-null lead values and never invents data.
 */
export function applyCustomerContactFallback(
  lead: LeadReadModel,
  customer: CustomerContactSnapshot | null | undefined,
): LeadReadModel {
  const linkedCustomerId = lead.customerId?.trim();
  if (!linkedCustomerId || !customer || customer.id.trim() !== linkedCustomerId) {
    return lead;
  }

  const email = trimOrNull(lead.email) ?? trimOrNull(customer.email);
  const phone = trimOrNull(lead.phone) ?? trimOrNull(customer.phone);
  const customerName = trimOrNull(customer.name);

  // Prefer a real CRM customer display name over Smart Capture placeholders.
  const namePlaceholder = isPlaceholderContactName(lead.name) || /^untitled lead$/i.test(lead.name?.trim() ?? "");
  const contactPlaceholder = isPlaceholderContactName(lead.contactPerson);
  const name = namePlaceholder && customerName ? customerName : lead.name;
  const contactPerson =
    (!contactPlaceholder ? trimOrNull(lead.contactPerson) : null) ??
    (customerName && (namePlaceholder || contactPlaceholder) ? customerName : trimOrNull(lead.contactPerson));

  if (
    email === lead.email &&
    phone === lead.phone &&
    name === lead.name &&
    contactPerson === lead.contactPerson
  ) {
    return lead;
  }

  return Object.freeze({
    ...lead,
    email,
    phone,
    name,
    contactPerson: contactPerson ?? lead.contactPerson,
  });
}

export function applyCustomerContactFallbacks(
  leads: readonly LeadReadModel[],
  customersById: ReadonlyMap<string, CustomerContactSnapshot>,
): LeadReadModel[] {
  return leads.map((lead) => {
    const customerId = lead.customerId?.trim();
    if (!customerId) return lead;
    return applyCustomerContactFallback(lead, customersById.get(customerId) ?? null);
  });
}
