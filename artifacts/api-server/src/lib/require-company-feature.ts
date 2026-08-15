import { getServiceClient } from "./integration-client.js";

export class FeatureNotEntitledError extends Error {
  readonly code = "FEATURE_NOT_ENTITLED";
  readonly featureCode: string;

  constructor(featureCode: string, message?: string) {
    super(message ?? `Feature "${featureCode}" is not entitled for this company`);
    this.name = "FeatureNotEntitledError";
    this.featureCode = featureCode;
  }
}

/** Channel catalog key → commercial feature code (mirrors login-app feature-code-map). */
const CHANNEL_KEY_TO_FEATURE: Readonly<Record<string, string>> = Object.freeze({
  whatsapp: "whatsapp_channel",
  facebook: "facebook_channel",
  messenger: "facebook_channel",
  instagram: "instagram_channel",
  email: "email_channel",
  sms: "sms_channel",
});

export function resolveChannelCommercialFeatureCode(
  channelKey: string | null | undefined,
): string | null {
  if (!channelKey?.trim()) return null;
  return CHANNEL_KEY_TO_FEATURE[channelKey.trim().toLowerCase()] ?? null;
}

/**
 * Authoritative commercial gate for api-server mutations.
 * Uses require_company_feature_v1 (fail-closed via is_feature_enabled).
 */
export async function requireCompanyFeature(
  companyId: string,
  featureCode: string,
): Promise<void> {
  const client = getServiceClient();
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
    throw new FeatureNotEntitledError(featureCode, error.message);
  }
  if (data === false) {
    throw new FeatureNotEntitledError(featureCode);
  }
}

export async function isCompanyFeatureEnabled(
  companyId: string,
  featureCode: string,
): Promise<boolean> {
  const client = getServiceClient();
  const { data, error } = await client.rpc("is_feature_enabled", {
    p_company_id: companyId,
    p_feature_code: featureCode,
  });
  if (error) return false;
  return Boolean(data);
}
