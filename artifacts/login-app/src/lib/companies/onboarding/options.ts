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

/** Stored English values for owner job title; UI labels come from i18n. */
export const OWNER_JOB_TITLE_OPTIONS = [
  { value: "Owner", i18nKey: "owner" },
  { value: "CEO", i18nKey: "ceo" },
  { value: "Founder", i18nKey: "founder" },
  { value: "Co-Founder", i18nKey: "coFounder" },
  { value: "General Manager", i18nKey: "generalManager" },
  { value: "Managing Director", i18nKey: "managingDirector" },
  { value: "Operations Manager", i18nKey: "operationsManager" },
  { value: "Other", i18nKey: "other" },
] as const;

export type OwnerJobTitleValue = (typeof OWNER_JOB_TITLE_OPTIONS)[number]["value"];
