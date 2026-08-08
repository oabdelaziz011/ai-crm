import type { CompanyBrandCenterDocument } from "@/lib/company-workspace/brand-center/types";
import type { CompanyIdentityValidationIssue } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i;
/** Loose international phone: digits with optional + and separators */
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;
const TAX_RE = /^[A-Za-z0-9\-/\s]{3,32}$/;

/**
 * Validate Brand Center / identity draft before persist.
 * Returns i18n message keys under companyWorkspace.brandCenter.validation.*
 */
export function validateBrandCenterIdentity(
  document: CompanyBrandCenterDocument,
): CompanyIdentityValidationIssue[] {
  const issues: CompanyIdentityValidationIssue[] = [];
  const { general, logos } = document;

  if (!general.companyName.trim()) {
    issues.push({ field: "name", messageKey: "nameRequired" });
  }

  if (!logos.main?.trim()) {
    issues.push({ field: "logoUrl", messageKey: "logoRequired" });
  }

  const website = general.website.trim();
  if (website && !WEBSITE_RE.test(website)) {
    issues.push({ field: "website", messageKey: "websiteInvalid" });
  }

  const email = general.supportEmail.trim();
  if (email && !EMAIL_RE.test(email)) {
    issues.push({ field: "contactEmail", messageKey: "emailInvalid" });
  }

  const phone = general.supportPhone.trim();
  if (phone && !PHONE_RE.test(phone)) {
    issues.push({ field: "contactPhone", messageKey: "phoneInvalid" });
  }

  const legal = general.legalName.trim();
  if (legal && legal.length < 2) {
    issues.push({ field: "legalName", messageKey: "legalNameInvalid" });
  }

  return issues;
}

/** Optional billing-field validators (used when overview/billing editors supply values). */
export function validateBillingIdentityFields(input: {
  taxId?: string | null;
  commercialRegistration?: string | null;
}): CompanyIdentityValidationIssue[] {
  const issues: CompanyIdentityValidationIssue[] = [];
  const tax = input.taxId?.trim();
  if (tax && !TAX_RE.test(tax)) {
    issues.push({ field: "taxId", messageKey: "taxInvalid" });
  }
  const reg = input.commercialRegistration?.trim();
  if (reg) {
    // Column not in schema — reject attempts to persist invented storage.
    issues.push({ field: "commercialRegistration", messageKey: "commercialRegistrationUnavailable" });
  }
  return issues;
}
