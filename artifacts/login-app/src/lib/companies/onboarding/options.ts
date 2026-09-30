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

/**
 * Active top-level acquisition options for NEW company registration / onboarding.
 * youtube_video and advertisement were removed from the selectable list (still readable as legacy).
 */
export const COMPANY_ACQUISITION_SOURCES = [
  "search_engine",
  "linkedin",
  "social_media",
  "referral",
  "partner_agency",
  "event_conference",
  "direct_outreach",
  "website_blog",
  "other",
] as const;

export type CompanyAcquisitionSource = (typeof COMPANY_ACQUISITION_SOURCES)[number];

/**
 * Historical top-level values that may still exist on companies rows.
 * Not selectable for new registrations; kept for display / parsing only.
 */
export const COMPANY_ACQUISITION_LEGACY_SOURCES = [
  "youtube_video",
  "advertisement",
] as const;

export type CompanyAcquisitionLegacySource =
  (typeof COMPANY_ACQUISITION_LEGACY_SOURCES)[number];

/** Nested platforms when top-level = social_media (includes YouTube). */
export const COMPANY_ACQUISITION_SOCIAL_PLATFORMS = [
  "facebook",
  "instagram",
  "x",
  "tiktok",
  "youtube",
  "other",
] as const;

export type CompanyAcquisitionSocialPlatform =
  (typeof COMPANY_ACQUISITION_SOCIAL_PLATFORMS)[number];

/**
 * Nested ad placements for legacy advertisement records only.
 * Not offered in the new registration UI.
 */
export const COMPANY_ACQUISITION_AD_PLACEMENTS = [
  "facebook",
  "instagram",
  "linkedin",
  "google",
  "youtube",
  "x",
  "tiktok",
  "other",
] as const;

export type CompanyAcquisitionAdPlacement =
  (typeof COMPANY_ACQUISITION_AD_PLACEMENTS)[number];

/** Active top-level sources that never store acquisition_source_detail. */
export const COMPANY_ACQUISITION_SOURCES_WITHOUT_DETAIL = [
  "search_engine",
  "linkedin",
  "referral",
  "partner_agency",
  "event_conference",
  "direct_outreach",
  "website_blog",
] as const;

export function isCompanyAcquisitionSource(
  value: string | null | undefined,
): value is CompanyAcquisitionSource {
  return (
    typeof value === "string" &&
    (COMPANY_ACQUISITION_SOURCES as readonly string[]).includes(value)
  );
}

export function isCompanyAcquisitionLegacySource(
  value: string | null | undefined,
): value is CompanyAcquisitionLegacySource {
  return (
    typeof value === "string" &&
    (COMPANY_ACQUISITION_LEGACY_SOURCES as readonly string[]).includes(value)
  );
}

/** True for any known source (active or legacy) — safe Company Details rendering. */
export function isCompanyAcquisitionKnownSource(
  value: string | null | undefined,
): boolean {
  return isCompanyAcquisitionSource(value) || isCompanyAcquisitionLegacySource(value);
}

export function isCompanyAcquisitionSocialPlatform(
  value: string | null | undefined,
): value is CompanyAcquisitionSocialPlatform {
  return (
    typeof value === "string" &&
    (COMPANY_ACQUISITION_SOCIAL_PLATFORMS as readonly string[]).includes(value)
  );
}

export function isCompanyAcquisitionAdPlacement(
  value: string | null | undefined,
): value is CompanyAcquisitionAdPlacement {
  return (
    typeof value === "string" &&
    (COMPANY_ACQUISITION_AD_PLACEMENTS as readonly string[]).includes(value)
  );
}

/** Whether a NEW registration source requires nested / custom detail. */
export function companyAcquisitionRequiresDetail(
  source: string | null | undefined,
): boolean {
  return source === "social_media" || source === "other";
}

/**
 * Resolve the persisted acquisition_source_detail from form state.
 * Canonical sub-keys for known platforms; custom trimmed text when Other.
 * Advertisement branch retained only for legacy pending / display hydration.
 */
export function resolveCompanyAcquisitionDetail(input: {
  source: string;
  subSource?: string | null;
  detail?: string | null;
}): string | null {
  const source = input.source.trim();
  const sub = (input.subSource ?? "").trim();
  const custom = (input.detail ?? "").trim();

  if (source === "other") {
    return custom || null;
  }

  if (source === "social_media") {
    if (!sub) return null;
    if (sub === "other") return custom || null;
    if (isCompanyAcquisitionSocialPlatform(sub) && sub !== "other") return sub;
    return null;
  }

  // Legacy-only: still resolve if somehow present in form/pending state.
  if (source === "advertisement") {
    if (!sub) return null;
    if (sub === "other") return custom || null;
    if (isCompanyAcquisitionAdPlacement(sub) && sub !== "other") return sub;
    return null;
  }

  return null;
}

/**
 * Split a persisted detail back into form sub-source + custom detail.
 * Supports legacy advertisement / youtube_video rows for Company Details / pending restore.
 */
export function parseCompanyAcquisitionFormFields(input: {
  source: string | null | undefined;
  detail: string | null | undefined;
}): { acquisitionSubSource: string; acquisitionSourceDetail: string } {
  const source = (input.source ?? "").trim();
  const detail = (input.detail ?? "").trim();

  if (source === "other") {
    return { acquisitionSubSource: "", acquisitionSourceDetail: detail };
  }

  if (source === "social_media") {
    if (isCompanyAcquisitionSocialPlatform(detail) && detail !== "other") {
      return { acquisitionSubSource: detail, acquisitionSourceDetail: "" };
    }
    if (detail) {
      return { acquisitionSubSource: "other", acquisitionSourceDetail: detail };
    }
    return { acquisitionSubSource: "", acquisitionSourceDetail: "" };
  }

  if (source === "advertisement") {
    if (isCompanyAcquisitionAdPlacement(detail) && detail !== "other") {
      return { acquisitionSubSource: detail, acquisitionSourceDetail: "" };
    }
    if (detail) {
      return { acquisitionSubSource: "other", acquisitionSourceDetail: detail };
    }
    return { acquisitionSubSource: "", acquisitionSourceDetail: "" };
  }

  return { acquisitionSubSource: "", acquisitionSourceDetail: "" };
}

/** Clear nested fields when the top-level source changes. */
export function acquisitionFieldsForSourceChange(nextSource: string): {
  acquisitionSource: string;
  acquisitionSubSource: string;
  acquisitionSourceDetail: string;
} {
  return {
    acquisitionSource: nextSource,
    acquisitionSubSource: "",
    acquisitionSourceDetail: "",
  };
}
