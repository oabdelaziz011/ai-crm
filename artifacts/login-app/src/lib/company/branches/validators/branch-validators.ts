import { z } from "zod";

export const branchStatusSchema = z.enum(["active", "inactive", "archived"]);

export const branchFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  code: z
    .string()
    .trim()
    .min(1, "Branch code is required")
    .max(32, "Branch code must be 32 characters or less")
    .regex(/^[A-Za-z0-9_-]+$/, "Branch code may only contain letters, numbers, hyphens, and underscores"),
  address: z.string().trim().optional().default(""),
  city: z.string().trim().optional().default(""),
  state: z.string().trim().optional().default(""),
  country: z.string().trim().optional().default(""),
  postal_code: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
  email: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((value) => !value || z.string().email().safeParse(value).success, {
      message: "Invalid email address",
    }),
  timezone: z.string().trim().min(1, "Timezone is required"),
  is_primary: z.boolean().default(false),
  status: branchStatusSchema.default("active"),
  manager_user_id: z.string().uuid().nullable().optional().default(null),
});

export type BranchFormSchema = z.infer<typeof branchFormSchema>;

export function normalizeBranchCode(code: string): string {
  return code.trim().toUpperCase();
}

export function formValuesToInsert(
  companyId: string,
  values: BranchFormSchema,
  actorId?: string | null,
) {
  return {
    company_id: companyId,
    name: values.name.trim(),
    code: normalizeBranchCode(values.code),
    address_line1: values.address.trim() || null,
    city: values.city.trim() || null,
    state: values.state.trim() || null,
    country: values.country.trim() || null,
    postal_code: values.postal_code.trim() || null,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    timezone: values.timezone,
    is_primary: values.is_primary,
    status: values.status,
    manager_user_id: values.manager_user_id || null,
    created_by: actorId ?? null,
    updated_by: actorId ?? null,
  };
}

export function formValuesToUpdate(values: BranchFormSchema, actorId?: string | null) {
  return {
    name: values.name.trim(),
    code: normalizeBranchCode(values.code),
    address_line1: values.address.trim() || null,
    city: values.city.trim() || null,
    state: values.state.trim() || null,
    country: values.country.trim() || null,
    postal_code: values.postal_code.trim() || null,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    timezone: values.timezone,
    is_primary: values.is_primary,
    status: values.status,
    manager_user_id: values.manager_user_id || null,
    updated_by: actorId ?? null,
  };
}

export function branchToFormValues(branch: {
  name: string;
  code: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  is_primary: boolean;
  status: "active" | "inactive" | "archived";
  manager_user_id?: string | null;
}): BranchFormSchema {
  return {
    name: branch.name,
    code: branch.code ?? "",
    address: branch.address_line1 ?? "",
    city: branch.city ?? "",
    state: branch.state ?? "",
    country: branch.country ?? "",
    postal_code: branch.postal_code ?? "",
    phone: branch.phone ?? "",
    email: branch.email ?? "",
    timezone: branch.timezone,
    is_primary: branch.is_primary,
    status: branch.status,
    manager_user_id: branch.manager_user_id ?? null,
  };
}
