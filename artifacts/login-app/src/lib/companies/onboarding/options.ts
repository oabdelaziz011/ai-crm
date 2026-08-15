/** Controlled selectable values — no separate lookup table. */

export const COMPANY_BUSINESS_TYPES = [
  "clinic",
  "hospital",
  "dental",
  "pharmacy",
  "agency",
  "hotel",
  "retail",
  "services",
  "education",
  "technology",
  "other",
] as const;

export type CompanyBusinessType = (typeof COMPANY_BUSINESS_TYPES)[number];

export const COMPANY_INDUSTRIES = [
  "healthcare",
  "beauty_wellness",
  "retail_commerce",
  "professional_services",
  "education_training",
  "technology_software",
  "hospitality",
  "other",
] as const;

export type CompanyIndustry = (typeof COMPANY_INDUSTRIES)[number];

export const COMPANY_ONBOARDING_CURRENCIES = [
  "SAR",
  "EGP",
  "AED",
  "USD",
  "EUR",
  "GBP",
] as const;

export type CompanyOnboardingCurrency = (typeof COMPANY_ONBOARDING_CURRENCIES)[number];
