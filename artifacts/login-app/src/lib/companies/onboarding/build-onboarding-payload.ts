import type { CompanyOnboardingPayload, CompanyOnboardingValues } from "./types";
import { resolveCompanyAcquisitionDetail } from "./options";
import { resolveOnboardingPhoneE164 } from "./sync-owner-from-account";
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

  const acquisitionSource = values.acquisitionSource.trim();

  // Company and owner phones resolve independently — never fall back across entities.
  const companyPhoneE164 =
    resolveOnboardingPhoneE164(values.contactPhone, values.contactPhoneRegion) ??
    values.contactPhone.trim();
  const ownerPhoneE164 = resolveOnboardingPhoneE164(
    values.ownerPhone,
    values.ownerPhoneRegion,
  );

  return {
    name: values.name.trim(),
    legal_name: values.legalName.trim(),
    business_type: values.businessType.trim(),
    industry: values.industry.trim(),
    contact_email: values.contactEmail.trim(),
    contact_phone: companyPhoneE164,
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
    owner_phone: ownerPhoneE164,
    owner_job_title: emptyToNull(values.ownerJobTitle) ?? "Owner",
    acquisition_source: acquisitionSource,
    acquisition_source_detail: resolveCompanyAcquisitionDetail({
      source: acquisitionSource,
      subSource: values.acquisitionSubSource,
      detail: values.acquisitionSourceDetail,
    }),
    status: options.mode === "admin_add" ? "Trial" : undefined,
    subscription_plan: "Basic",
  };
}
