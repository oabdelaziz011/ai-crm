import type { CompanyOnboardingPayload, CompanyOnboardingValues } from "./types";
import { buildOwnerDisplayName } from "./validation";

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function buildCompanyOnboardingPayload(
  values: CompanyOnboardingValues,
  options: { mode: "first_time" | "admin_add" },
): CompanyOnboardingPayload {
  const displayName =
    values.ownerDisplayName.trim() ||
    buildOwnerDisplayName(values.ownerFirstName, values.ownerLastName, values.ownerEmail);

  return {
    name: values.name.trim(),
    legal_name: values.legalName.trim(),
    business_type: values.businessType.trim(),
    industry: values.industry.trim(),
    contact_email: values.contactEmail.trim(),
    contact_phone: values.contactPhone.trim(),
    website: normalizeWebsite(values.website),
    description: emptyToNull(values.description),
    tax_id: emptyToNull(values.taxId),
    commercial_registration: emptyToNull(values.commercialRegistration),
    country: emptyToNull(values.country),
    city: emptyToNull(values.city),
    address: emptyToNull(values.address),
    timezone: emptyToNull(values.timezone) ?? "UTC",
    currency: emptyToNull(values.currency) ?? "SAR",
    contact_person: displayName,
    owner_display_name: displayName,
    owner_full_name: displayName,
    // Always persist an owner phone on the profile — fall back to company contact phone
    // when the account step left ownerPhone empty (contact_phone is required).
    owner_phone: emptyToNull(values.ownerPhone) ?? emptyToNull(values.contactPhone),
    owner_job_title: emptyToNull(values.ownerJobTitle) ?? "Owner",
    status: options.mode === "admin_add" ? "Trial" : undefined,
    subscription_plan: "Basic",
  };
}
