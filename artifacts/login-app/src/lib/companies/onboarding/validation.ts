import { z } from "zod";
import {
  COMPANY_ACQUISITION_SOURCES,
  COMPANY_ACQUISITION_SOURCES_WITHOUT_DETAIL,
  COMPANY_BUSINESS_TYPES,
  COMPANY_INDUSTRIES,
  COMPANY_ONBOARDING_CURRENCIES,
  isCompanyAcquisitionSocialPlatform,
} from "./options";
import { validateOnboardingPhoneInput } from "./sync-owner-from-account";
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

const sourcesWithoutDetail = new Set<string>(COMPANY_ACQUISITION_SOURCES_WITHOUT_DETAIL);

export function createCompanyOnboardingSchemas() {
  const required = () => z.string().trim().min(1, { message: "required" });

  const companyStep = z
    .object({
      name: required().max(200, { message: "nameTooLong" }),
      legalName: required().max(200, { message: "nameTooLong" }),
      businessType: z.enum(COMPANY_BUSINESS_TYPES, {
        errorMap: () => ({ message: "required" }),
      }),
      industry: z.enum(COMPANY_INDUSTRIES, {
        errorMap: () => ({ message: "required" }),
      }),
      contactEmail: emailRequired,
      contactPhone: z.string().trim().min(1, { message: "required" }).max(40),
      contactPhoneRegion: z.string().trim().min(2).max(2).optional().or(z.literal("")),
      website: optionalUrl,
      description: z.string().trim().max(2000).optional().or(z.literal("")),
      taxId: z.string().trim().max(80).optional().or(z.literal("")),
      commercialRegistration: z.string().trim().max(80).optional().or(z.literal("")),
      acquisitionSource: z.enum(COMPANY_ACQUISITION_SOURCES, {
        errorMap: () => ({ message: "required" }),
      }),
      acquisitionSubSource: z.string().max(64).optional().or(z.literal("")),
      acquisitionSourceDetail: z
        .string()
        .max(500, { message: "nameTooLong" })
        .optional()
        .or(z.literal("")),
    })
    .superRefine((data, ctx) => {
      const phoneCheck = validateOnboardingPhoneInput({
        phone: data.contactPhone,
        region: data.contactPhoneRegion || "EG",
        required: true,
      });
      if (phoneCheck.code === "empty") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "required",
          path: ["contactPhone"],
        });
      } else if (phoneCheck.code === "phone_region_required") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "phoneRegionRequired",
          path: ["contactPhone"],
        });
      } else if (phoneCheck.code !== "ok") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "invalidPhone",
          path: ["contactPhone"],
        });
      }

      const source = data.acquisitionSource;
      const sub = (data.acquisitionSubSource ?? "").trim();
      const detail = (data.acquisitionSourceDetail ?? "").trim();

      if (sourcesWithoutDetail.has(source)) {
        if (sub || detail) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "acquisitionDetailNotAllowed",
            path: ["acquisitionSourceDetail"],
          });
        }
        return;
      }

      if (source === "other") {
        if (sub) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "acquisitionDetailNotAllowed",
            path: ["acquisitionSubSource"],
          });
        }
        if (!detail) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "acquisitionDetailRequired",
            path: ["acquisitionSourceDetail"],
          });
        }
        return;
      }

      if (source === "social_media") {
        if (!sub || !isCompanyAcquisitionSocialPlatform(sub)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "acquisitionSocialRequired",
            path: ["acquisitionSubSource"],
          });
          return;
        }
        if (sub === "other" && !detail) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "acquisitionDetailRequired",
            path: ["acquisitionSourceDetail"],
          });
        }
        if (sub !== "other" && detail) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "acquisitionDetailNotAllowed",
            path: ["acquisitionSourceDetail"],
          });
        }
      }
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
        contactPhoneRegion: values.contactPhoneRegion,
        website: values.website,
        description: values.description,
        taxId: values.taxId,
        commercialRegistration: values.commercialRegistration,
        acquisitionSource: values.acquisitionSource,
        acquisitionSubSource: values.acquisitionSubSource,
        acquisitionSourceDetail: values.acquisitionSourceDetail,
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

// Re-export social platforms for consumers that import validation helpers.
export { COMPANY_ACQUISITION_SOCIAL_PLATFORMS } from "./options";
