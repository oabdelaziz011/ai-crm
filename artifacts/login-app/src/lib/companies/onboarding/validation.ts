import { z } from "zod";
import {
  COMPANY_BUSINESS_TYPES,
  COMPANY_INDUSTRIES,
  COMPANY_ONBOARDING_CURRENCIES,
} from "./options";
import type { CompanyOnboardingStepId, CompanyOnboardingValues } from "./types";

const optionalUrl = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      /^https?:\/\/.+/i.test(value) ||
      /^www\./i.test(value),
    { message: "websiteInvalid" },
  );

const emailRequired = z.string().trim().min(1, { message: "required" }).email({
  message: "emailInvalid",
});

export function createCompanyOnboardingSchemas() {
  const required = () => z.string().trim().min(1, { message: "required" });

  const companyStep = z.object({
    name: required().max(200, { message: "nameTooLong" }),
    legalName: required().max(200, { message: "nameTooLong" }),
    businessType: z.enum(COMPANY_BUSINESS_TYPES, {
      errorMap: () => ({ message: "required" }),
    }),
    industry: z.enum(COMPANY_INDUSTRIES, {
      errorMap: () => ({ message: "required" }),
    }),
    contactEmail: emailRequired,
    contactPhone: required().max(40),
    website: optionalUrl,
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    taxId: z.string().trim().max(80).optional().or(z.literal("")),
    commercialRegistration: z.string().trim().max(80).optional().or(z.literal("")),
  });

  const businessStep = z.object({
    country: required().max(120),
    city: required().max(120),
    address: z.string().trim().max(1000).optional().or(z.literal("")),
    timezone: required().max(64),
    currency: z.enum(COMPANY_ONBOARDING_CURRENCIES, {
      errorMap: () => ({ message: "required" }),
    }),
  });

  const ownerStep = z.object({
    ownerFirstName: required().max(100),
    ownerLastName: required().max(100),
    ownerDisplayName: required().max(200),
    ownerEmail: emailRequired,
    ownerPhone: z.string().trim().max(40).optional().or(z.literal("")),
    ownerJobTitle: required().max(120),
  });

  return { companyStep, businessStep, ownerStep };
}

export type CompanyOnboardingFieldErrors = Partial<
  Record<keyof CompanyOnboardingValues, string>
>;

export function validateCompanyOnboardingStep(
  step: CompanyOnboardingStepId,
  values: CompanyOnboardingValues,
): CompanyOnboardingFieldErrors {
  const schemas = createCompanyOnboardingSchemas();
  const mapZod = (result: z.SafeParseReturnType<unknown, unknown>) => {
    if (result.success) return {};
    const errors: CompanyOnboardingFieldErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in errors)) {
        errors[key as keyof CompanyOnboardingValues] = issue.message;
      }
    }
    return errors;
  };

  if (step === "company") {
    return mapZod(
      schemas.companyStep.safeParse({
        name: values.name,
        legalName: values.legalName,
        businessType: values.businessType,
        industry: values.industry,
        contactEmail: values.contactEmail,
        contactPhone: values.contactPhone,
        website: values.website,
        description: values.description,
        taxId: values.taxId,
        commercialRegistration: values.commercialRegistration,
      }),
    );
  }

  if (step === "business") {
    return mapZod(
      schemas.businessStep.safeParse({
        country: values.country,
        city: values.city,
        address: values.address,
        timezone: values.timezone,
        currency: values.currency,
      }),
    );
  }

  if (step === "owner") {
    return mapZod(
      schemas.ownerStep.safeParse({
        ownerFirstName: values.ownerFirstName,
        ownerLastName: values.ownerLastName,
        ownerDisplayName: values.ownerDisplayName,
        ownerEmail: values.ownerEmail,
        ownerPhone: values.ownerPhone,
        ownerJobTitle: values.ownerJobTitle,
      }),
    );
  }

  return {};
}

export function buildOwnerDisplayName(
  firstName: string,
  lastName: string,
  fallback = "",
): string {
  const combined = `${firstName.trim()} ${lastName.trim()}`.trim();
  return combined || fallback.trim();
}
