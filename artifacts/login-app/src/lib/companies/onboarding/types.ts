export type CompanyOnboardingMode = "first_time" | "admin_add";

export type CompanyOnboardingStepId =
  | "company"
  | "business"
  | "owner"
  | "plan"
  | "review";

export const COMPANY_ONBOARDING_STEPS: readonly CompanyOnboardingStepId[] = [
  "company",
  "business",
  "owner",
  "plan",
  "review",
] as const;

export type CompanyOnboardingValues = {
  name: string;
  legalName: string;
  businessType: string;
  industry: string;
  contactEmail: string;
  contactPhone: string;
  /** ISO-2 region for company contact phone (independent of account/owner phone). */
  contactPhoneRegion: string;
  website: string;
  description: string;
  taxId: string;
  commercialRegistration: string;
  country: string;
  city: string;
  address: string;
  timezone: string;
  currency: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerDisplayName: string;
  ownerEmail: string;
  ownerPhone: string;
  /** ISO-2 region for account/owner phone (independent of company contact phone). */
  ownerPhoneRegion: string;
  ownerJobTitle: string;
  /** Canonical company registration attribution (not CRM customer source). */
  acquisitionSource: string;
  /**
   * Nested selection for social_media platforms (facebook, …, youtube, other).
   * Empty for flat top-level sources. Legacy advertisement placements parsed for display only.
   */
  acquisitionSubSource: string;
  /**
   * Custom text when top-level = other, or when nested sub-source = other.
   * Never holds translated UI labels.
   */
  acquisitionSourceDetail: string;
};

export type CompanyOnboardingPayload = {
  name: string;
  legal_name: string;
  business_type: string;
  industry: string;
  contact_email: string;
  contact_phone: string;
  website?: string | null;
  description?: string | null;
  tax_id?: string | null;
  commercial_registration?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  timezone?: string | null;
  currency?: string | null;
  contact_person?: string | null;
  owner_display_name?: string | null;
  owner_full_name?: string | null;
  owner_phone?: string | null;
  owner_job_title?: string | null;
  /** Canonical values only — never translated UI labels. */
  acquisition_source: string;
  acquisition_source_detail?: string | null;
  status?: string;
  subscription_plan?: string;
};

export function emptyCompanyOnboardingValues(
  overrides: Partial<CompanyOnboardingValues> = {},
): CompanyOnboardingValues {
  return {
    name: "",
    legalName: "",
    businessType: "",
    industry: "",
    contactEmail: "",
    contactPhone: "",
    contactPhoneRegion: "EG",
    website: "",
    description: "",
    taxId: "",
    commercialRegistration: "",
    country: "",
    city: "",
    address: "",
    timezone: "Asia/Riyadh",
    currency: "SAR",
    ownerFirstName: "",
    ownerLastName: "",
    ownerDisplayName: "",
    ownerEmail: "",
    ownerPhone: "",
    ownerPhoneRegion: "EG",
    ownerJobTitle: "Owner",
    acquisitionSource: "",
    acquisitionSubSource: "",
    acquisitionSourceDetail: "",
    ...overrides,
  };
}
