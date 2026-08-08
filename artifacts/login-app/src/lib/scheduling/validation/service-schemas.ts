import { z } from "zod";
import {
  COMPANY_DEFAULT_CURRENCY,
  SCHEDULING_SERVICE_STATUSES,
  SERVICE_PRICING_CURRENCIES,
} from "@/lib/scheduling/types";

export const serviceGeneralFormSchema = z.object({
  name: z.string().trim().min(1, "scheduling.validation.serviceNameRequired").max(120),
  category: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(SCHEDULING_SERVICE_STATUSES).default("active"),
});

export type ServiceGeneralFormValues = z.infer<typeof serviceGeneralFormSchema>;

/** @deprecated Prefer serviceGeneralFormSchema + pricing rules. Kept for create bootstrap. */
export const serviceFormSchema = serviceGeneralFormSchema.extend({
  duration_minutes: z.coerce.number().int().min(5).max(24 * 60).default(30),
  price: z.coerce.number().min(0).max(1_000_000).default(0),
  currency: z.string().trim().min(3).max(3).default("USD"),
});

export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

export const pricingRuleFormSchema = z.object({
  id: z.string().uuid().optional(),
  typeId: z.string().uuid({ message: "scheduling.services.pricing.validation.typeRequired" }),
  price: z.coerce.number().gt(0, "scheduling.services.pricing.validation.pricePositive"),
  currency: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === COMPANY_DEFAULT_CURRENCY ||
        (SERVICE_PRICING_CURRENCIES as readonly string[]).includes(value.toUpperCase()),
      "scheduling.services.pricing.validation.currencyRequired",
    ),
  durationMinutes: z.coerce
    .number()
    .int()
    .gt(0, "scheduling.services.pricing.validation.durationPositive")
    .max(24 * 60),
  isDefault: z.boolean().default(false),
  description: z.string().trim().max(500).nullable().optional(),
});

export type PricingRuleFormValues = z.infer<typeof pricingRuleFormSchema>;

export const pricingRulesFormSchema = z
  .object({
    rules: z.array(pricingRuleFormSchema).min(1, "scheduling.services.pricing.validation.atLeastOne"),
  })
  .superRefine((value, ctx) => {
    const defaults = value.rules.filter((rule) => rule.isDefault);
    if (defaults.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduling.services.pricing.validation.oneDefault",
        path: ["rules"],
      });
    }
    const typeIds = value.rules.map((rule) => rule.typeId);
    if (new Set(typeIds).size !== typeIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduling.services.pricing.validation.uniqueTypes",
        path: ["rules"],
      });
    }
  });

export type PricingRulesFormValues = z.infer<typeof pricingRulesFormSchema>;

export const capabilitySelectionSchema = z.object({
  ids: z.array(z.string().uuid()),
});

export type CapabilitySelectionValues = z.infer<typeof capabilitySelectionSchema>;
