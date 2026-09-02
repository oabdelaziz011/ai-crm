import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGACY_AI_FEATURE_KEY_MAP } from "@workspace/configuration-platform";
import { isPlatformAIFeatureKey } from "@workspace/platform-ai-provider";
import { toBillingFeatureCode } from "@/lib/billing/feature-code-map";
import { requireCompanyFeature } from "@/lib/billing/require-company-feature";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "./application-layer-bootstrap.js";
import type { LoginAppPortContext } from "./create-login-app-application-ports.js";

/**
 * Runtime platform-AI kill-switch via canonical RPC (fail-closed).
 * Commercial entitlement, when mapped, is enforced independently first.
 */
async function resolvePlatformAiRuntimeKillSwitch(
  client: SupabaseClient,
  companyId: string,
  platformAiFeatureKey: string,
  unifiedKey: string,
): Promise<boolean> {
  const scopedCompanyId = companyId?.trim();
  if (!scopedCompanyId) return false;

  const billingCode = toBillingFeatureCode(unifiedKey);
  if (billingCode) {
    try {
      await requireCompanyFeature(client, scopedCompanyId, billingCode);
    } catch {
      return false;
    }
  }

  const { data, error } = await client.rpc("platform_ai_feature_enabled", {
    p_company_id: scopedCompanyId,
    p_feature_key: platformAiFeatureKey,
  });
  if (error) return false;
  return data === true;
}

export async function resolveFeatureEnabledViaApplicationLayer(
  portContext: LoginAppPortContext,
  featureKey: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const unifiedKey = LEGACY_AI_FEATURE_KEY_MAP[featureKey] ?? featureKey;

  if (isPlatformAIFeatureKey(featureKey)) {
    if (!client) return false;
    return resolvePlatformAiRuntimeKillSwitch(
      client,
      portContext.companyId,
      featureKey,
      unifiedKey,
    );
  }

  const registry = createLoginAppApplicationLayerRegistry(portContext, client);
  const context = buildApplicationContext({
    tenantId: portContext.companyId,
    actorId: portContext.actorUserId,
    permissions: permissionCodes(portContext.hasPermission, portContext.isSuperAdmin),
  });

  try {
    const result = await registry.getServices().featureFlags.isEnabled({ featureKey: unifiedKey }, context);
    return result.data?.enabled === true;
  } catch {
    return false;
  }
}
