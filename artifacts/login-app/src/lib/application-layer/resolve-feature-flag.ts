import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGACY_AI_FEATURE_KEY_MAP } from "@workspace/configuration-platform";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "./application-layer-bootstrap.js";
import type { LoginAppPortContext } from "./create-login-app-application-ports.js";

export async function resolveFeatureEnabledViaApplicationLayer(
  portContext: LoginAppPortContext,
  featureKey: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const unifiedKey = LEGACY_AI_FEATURE_KEY_MAP[featureKey] ?? featureKey;
  const registry = createLoginAppApplicationLayerRegistry(portContext, client);
  const context = buildApplicationContext({
    tenantId: portContext.companyId,
    actorId: portContext.actorUserId,
    permissions: permissionCodes(portContext.hasPermission, portContext.isSuperAdmin),
  });
  const result = await registry.getServices().featureFlags.isEnabled({ featureKey: unifiedKey }, context);
  return result.data?.enabled ?? true;
}
