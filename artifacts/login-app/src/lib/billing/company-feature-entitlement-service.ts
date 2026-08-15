/**
 * Application-level commercial entitlement service (Phase 3).
 * Authoritative rules live in Phase 2 RPCs — this layer only orchestrates calls.
 */
import type { CompanyEntitlement } from "./types";
import type {
  CompanyAccessState,
  CompanyFeatureAccess,
} from "./company-feature-access";
import {
  isBillingFeatureCode,
  toBillingFeatureCode,
  type BillingFeatureCode,
} from "./feature-code-map";

export type EntitlementRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

let defaultClient: EntitlementRpcClient | null = null;

/** Bind the app Supabase client once (login-app bootstrap / hooks). */
export function bindCompanyFeatureEntitlementClient(client: EntitlementRpcClient): void {
  defaultClient = client;
}

function resolveClient(client?: EntitlementRpcClient): EntitlementRpcClient {
  const resolved = client ?? defaultClient;
  if (!resolved) {
    throw new Error("Entitlement RPC client not bound — call bindCompanyFeatureEntitlementClient()");
  }
  return resolved;
}

export async function hasCompanyFeature(
  companyId: string,
  featureCode: string,
  client?: EntitlementRpcClient,
): Promise<boolean> {
  const code = toBillingFeatureCode(featureCode) ?? featureCode;
  const { data, error } = await resolveClient(client).rpc("is_feature_enabled", {
    p_company_id: companyId,
    p_feature_code: code,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function isCompanyFeatureActive(
  companyId: string,
  featureCode: string,
  client?: EntitlementRpcClient,
): Promise<boolean> {
  return hasCompanyFeature(companyId, featureCode, client);
}

export async function getCompanyAccessState(
  companyId: string,
  client?: EntitlementRpcClient,
): Promise<CompanyAccessState> {
  const { data, error } = await resolveClient(client).rpc("get_company_access_state", {
    p_company_id: companyId,
  });
  if (error) throw new Error(error.message);
  const state = String(data ?? "expired");
  if (state === "trial" || state === "active" || state === "suspended" || state === "expired") {
    return state;
  }
  return "expired";
}

export async function getCompanyFeatureEntitlements(
  companyId: string,
  client?: EntitlementRpcClient,
): Promise<CompanyEntitlement[]> {
  const { data, error } = await resolveClient(client).rpc("get_company_entitlements", {
    p_company_id: companyId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as CompanyEntitlement[];
}

/** Repair path: provision package grants from the current subscription plan. */
export async function syncCompanyPackageEntitlements(
  companyId: string,
  client?: EntitlementRpcClient,
): Promise<{
  synced: boolean;
  reason?: string;
  provisioned: number;
  revoked: number;
  featureCodes: string[];
}> {
  const { data, error } = await resolveClient(client).rpc("sync_company_package_entitlements_v1", {
    p_company_id: companyId,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const codes = Array.isArray(row.feature_codes)
    ? row.feature_codes.map((c) => String(c))
    : [];
  return {
    synced: Boolean(row.synced),
    reason: row.reason ? String(row.reason) : undefined,
    provisioned: Number(row.provisioned ?? 0),
    revoked: Number(row.revoked ?? 0),
    featureCodes: codes,
  };
}

export async function getCompanyFeatureAccess(
  companyId: string,
  featureCode: string,
  client?: EntitlementRpcClient,
): Promise<CompanyFeatureAccess> {
  const code = toBillingFeatureCode(featureCode) ?? featureCode;
  const rows = await getCompanyFeatureEntitlements(companyId, client);
  const row = rows.find((r) => r.feature_code === code);
  const enabled = await hasCompanyFeature(companyId, code, client);

  if (!row) {
    return Object.freeze({
      featureCode: code,
      enabled,
      commercial: isBillingFeatureCode(code)
        ? !["core_crm", "customers"].includes(code)
        : true,
      source: "none",
      reason: enabled ? undefined : "No entitlement row",
    });
  }

  return Object.freeze({
    featureCode: code,
    enabled,
    commercial: Boolean(row.is_commercial),
    source: row.source,
    startsAt: row.starts_at ?? null,
    expiresAt: row.expires_at ?? null,
    reason: enabled
      ? undefined
      : row.is_commercial
        ? "Commercial feature not entitled"
        : "Feature disabled",
  });
}

/** Platform-admin mutation — requires is_super_admin on the server RPC. */
export async function setCompanyFeatureGrant(
  input: {
    companyId: string;
    featureCode: BillingFeatureCode | string;
    enabled: boolean;
    source?: "trial" | "manual" | "contract" | "system";
    startsAt?: string | null;
    expiresAt?: string | null;
    notes?: string | null;
    reason?: string | null;
  },
  client?: EntitlementRpcClient,
): Promise<string> {
  const code = toBillingFeatureCode(input.featureCode) ?? input.featureCode;
  const { data, error } = await resolveClient(client).rpc("set_company_feature_grant", {
    p_company_id: input.companyId,
    p_feature_code: code,
    p_enabled: input.enabled,
    p_source: input.source ?? "manual",
    p_starts_at: input.startsAt ?? new Date().toISOString(),
    p_expires_at: input.expiresAt ?? null,
    p_notes: input.notes ?? null,
    p_reason: input.reason ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function revokeCompanyFeatureGrant(
  companyId: string,
  featureCode: string,
  notes?: string | null,
  client?: EntitlementRpcClient,
): Promise<boolean> {
  const code = toBillingFeatureCode(featureCode) ?? featureCode;
  const { data, error } = await resolveClient(client).rpc("revoke_company_feature_grant", {
    p_company_id: companyId,
    p_feature_code: code,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Platform-admin: extend trial end + trial-source grants only. */
export async function extendCompanyTrial(
  companyId: string,
  newEndsAt: string,
  client?: EntitlementRpcClient,
): Promise<{ companyId: string; trialEndsAt: string; trialGrantsUpdated: number }> {
  const { data, error } = await resolveClient(client).rpc("extend_company_trial_v1", {
    p_company_id: companyId,
    p_new_ends_at: newEndsAt,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    companyId: String(row.company_id ?? companyId),
    trialEndsAt: String(row.trial_ends_at ?? newEndsAt),
    trialGrantsUpdated: Number(row.trial_grants_updated ?? 0),
  };
}

export const companyFeatureEntitlementService = Object.freeze({
  hasCompanyFeature,
  isCompanyFeatureActive,
  getCompanyAccessState,
  getCompanyFeatureEntitlements,
  getCompanyFeatureAccess,
  syncCompanyPackageEntitlements,
  setCompanyFeatureGrant,
  revokeCompanyFeatureGrant,
  extendCompanyTrial,
});
