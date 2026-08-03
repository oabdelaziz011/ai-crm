import type { SupabaseClient } from "@supabase/supabase-js";
import type { LicenseWritePort } from "@workspace/application-layer";
import type { CompanyLicenseState } from "@workspace/configuration-platform";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

type LicenseRow = {
  tenant_id: string;
  plan_code: string;
  status: string;
  trial_ends_at: string | null;
  expires_at: string | null;
  grace_ends_at: string | null;
  add_ons: string[] | null;
};

function mapLicense(row: LicenseRow): CompanyLicenseState {
  return Object.freeze({
    tenantId: String(row.tenant_id),
    planCode: String(row.plan_code),
    status: row.status as CompanyLicenseState["status"],
    trialEndsAt: row.trial_ends_at,
    expiresAt: row.expires_at,
    graceEndsAt: row.grace_ends_at,
    addOns: Object.freeze(Array.isArray(row.add_ons) ? row.add_ons : []),
  });
}

function canWrite(ctx: LoginAppPortContext): boolean {
  if (ctx.isSuperAdmin) return true;
  return ctx.hasPermission("licenses.write") || ctx.hasPermission("licenses.assign");
}

export function createLoginAppLicenseWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): LicenseWritePort {
  return {
    async assignPlan(input) {
      if (input.tenantId !== ctx.companyId || !canWrite(ctx)) {
        throw new Error("Permission denied");
      }

      const { data, error } = await client
        .from("platform_company_licenses")
        .upsert(
          {
            tenant_id: input.tenantId,
            plan_code: input.planCode,
            status: input.status ?? "active",
            trial_ends_at: input.trialEndsAt ?? null,
            expires_at: input.expiresAt ?? null,
            grace_ends_at: input.graceEndsAt ?? null,
            add_ons: input.addOns ?? [],
            updated_at: new Date().toISOString(),
            updated_by: input.actorId,
          },
          { onConflict: "tenant_id" },
        )
        .select("tenant_id, plan_code, status, trial_ends_at, expires_at, grace_ends_at, add_ons")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Failed to assign license");
      }

      return mapLicense(data as LicenseRow);
    },
  };
}
