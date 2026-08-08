import type {
  CompanyBrandColors,
  CompanyBrandLogos,
} from "@/lib/company-workspace/brand-center/types";

/**
 * Single resolved company identity for the staff app.
 *
 * Primary sources (real columns — never duplicate into branding JSON):
 * - companies: name, logo_url, contact_email, contact_phone, branding
 * - company_billing_profiles: legal_name, tax_id, address, footer_text
 *
 * Temporary non-column store (until schema normalization sprint):
 * - companies.branding.general: shortName, website, description ONLY
 *
 * FUTURE SPRINT (after Company Workspace v1.0):
 * "Company Identity Schema Normalization" — promote short_name / website /
 * description (and commercial_registration if required) to real columns,
 * then stop reading them from branding.general. No migration in this sprint.
 */
export type CompanyIdentity = Readonly<{
  companyId: string;
  name: string | null;
  shortName: string | null;
  description: string | null;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  logoUrl: string | null;
  legalName: string | null;
  /** DB column: company_billing_profiles.tax_id */
  taxId: string | null;
  /**
   * Not present in current schema — always null until a column exists.
   * Do not invent storage in branding JSON.
   */
  commercialRegistration: string | null;
  /** DB column: company_billing_profiles.address */
  address: string | null;
  /** DB column: company_billing_profiles.footer_text */
  footerText: string | null;
  colors: CompanyBrandColors;
  logos: CompanyBrandLogos;
}>;

export type CompanyIdentityValidationIssue = {
  field:
    | "website"
    | "contactEmail"
    | "contactPhone"
    | "legalName"
    | "taxId"
    | "commercialRegistration"
    | "logoUrl"
    | "name";
  messageKey: string;
};

/** Fields that may live in branding.general until the normalization sprint. */
export const BRANDING_GENERAL_TEMPORARY_FIELDS = [
  "shortName",
  "website",
  "description",
] as const;
