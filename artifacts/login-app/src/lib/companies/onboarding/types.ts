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
  ownerJobTitle: string;
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
    ownerJobTitle: "Owner",
    ...overrides,
  };
}
