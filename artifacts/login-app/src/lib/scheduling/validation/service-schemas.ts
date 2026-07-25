import { z } from "zod";
import { SCHEDULING_SERVICE_STATUSES } from "@/lib/scheduling/types";

export const serviceFormSchema = z.object({
  name: z.string().trim().min(1, "scheduling.validation.serviceNameRequired").max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  duration_minutes: z.coerce.number().int().min(5).max(24 * 60),
  status: z.enum(SCHEDULING_SERVICE_STATUSES).default("active"),
});

export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

export const capabilitySelectionSchema = z.object({
  ids: z.array(z.string().uuid()),
});

export type CapabilitySelectionValues = z.infer<typeof capabilitySelectionSchema>;
