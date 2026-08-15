import type { SupabaseClient } from "@supabase/supabase-js";

export class FeatureNotEntitledError extends Error {
  readonly code = "FEATURE_NOT_ENTITLED";
  readonly featureCode: string;

  constructor(featureCode: string, message?: string) {
    super(message ?? `Feature "${featureCode}" is not entitled for this company`);
    this.name = "FeatureNotEntitledError";
    this.featureCode = featureCode;
  }
}

/**
 * Server/client commercial gate using billing SoT RPC.
 * Fail-closed: RPC error or false → throw.
 */
export async function requireCompanyFeature(
  client: SupabaseClient,
  companyId: string,
  featureCode: string,
): Promise<void> {
  const { data, error } = await client.rpc("require_company_feature_v1", {
    p_company_id: companyId,
    p_feature_code: featureCode,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/feature_not_entitled/i.test(msg) || error.code === "P0001") {
      const code = msg.includes(":") ? msg.split(":").pop()?.trim() || featureCode : featureCode;
      throw new FeatureNotEntitledError(code, msg);
    }
    // Fail closed on unknown errors
    throw new FeatureNotEntitledError(featureCode, error.message);
  }
  if (data === false) {
    throw new FeatureNotEntitledError(featureCode);
  }
}

export async function isCompanyFeatureEnabled(
  client: SupabaseClient,
  companyId: string,
  featureCode: string,
): Promise<boolean> {
  const { data, error } = await client.rpc("is_feature_enabled", {
    p_company_id: companyId,
    p_feature_code: featureCode,
  });
  if (error) return false;
  return Boolean(data);
}
