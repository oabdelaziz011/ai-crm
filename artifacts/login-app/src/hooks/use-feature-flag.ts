import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";
import { isCommercialBillingMappedKey } from "@/lib/billing/feature-code-map";
import {
  isRegisteredPlatformFeatureKey,
  LEGACY_AI_FEATURE_KEY_MAP,
  type PlatformFeatureKey,
} from "@workspace/configuration-platform";

function isRuntimeSensitivePlatformFlag(featureKey: string): boolean {
  return isCommercialBillingMappedKey(featureKey) || isRegisteredPlatformFeatureKey(featureKey);
}

function resolveRuntimeSensitiveEnabled(
  enabled: boolean | undefined,
  fetched: boolean,
  errored: boolean,
): boolean {
  if (!fetched || errored) return false;
  return enabled === true;
}

export function featureFlagQueryKey(companyId: string | null, featureKey: string) {
  return ["feature-flag", companyId, featureKey] as const;
}

function resolveUnifiedFeatureKey(featureKey: string): string {
  return LEGACY_AI_FEATURE_KEY_MAP[featureKey] ?? featureKey;
}

export function useFeatureFlag(featureKey: PlatformFeatureKey | string) {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = company?.id ?? null;
  const unifiedKey = resolveUnifiedFeatureKey(featureKey);
  const commercialMapped = isCommercialBillingMappedKey(unifiedKey);
  const runtimeSensitive = isRuntimeSensitivePlatformFlag(unifiedKey);

  const query = useQuery({
    queryKey: featureFlagQueryKey(companyId, unifiedKey),
    enabled: Boolean(companyId && user?.id),
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId || !user?.id) {
        return {
          enabled: runtimeSensitive ? false : true,
          source: "default" as const,
          licenseBlocked: commercialMapped,
        };
      }

      const portContext = {
        companyId,
        actorUserId: user.id,
        isSuperAdmin,
        hasPermission,
      };
      const registry = createLoginAppApplicationLayerRegistry(portContext);
      const context = buildApplicationContext({
        tenantId: companyId,
        actorId: user.id,
        permissions: permissionCodes(hasPermission, isSuperAdmin),
      });

      const result = await registry.getServices().featureFlags.isEnabled(
        { featureKey: unifiedKey },
        context,
      );

      return result.data ?? {
        enabled: runtimeSensitive ? false : true,
        featureKey: unifiedKey,
        source: "default" as const,
        licenseBlocked: commercialMapped,
      };
    },
  });

  const effectiveEnabled = runtimeSensitive
    ? resolveRuntimeSensitiveEnabled(query.data?.enabled, query.isFetched, query.isError)
    : (query.data?.enabled ?? true);

  return {
    isLoading: query.isLoading,
    /** Runtime/platform flags deny until an explicit enabled=true fetch completes. */
    isEnabled: effectiveEnabled,
    resolvedEnabled: query.isFetched ? query.data?.enabled : undefined,
    licenseBlocked: query.data?.licenseBlocked ?? false,
    licenseReason:
      query.data && "licenseReason" in query.data ? query.data.licenseReason : undefined,
    source: query.data?.source,
  };
}

export function useCanAccessFeature(featureKey: PlatformFeatureKey | string) {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = company?.id ?? null;
  const unifiedKey = resolveUnifiedFeatureKey(featureKey);
  const commercialMapped = isCommercialBillingMappedKey(unifiedKey);

  const query = useQuery({
    queryKey: ["license-access", companyId, unifiedKey] as const,
    enabled: Boolean(companyId && user?.id),
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId || !user?.id) {
        return { allowed: false, planCode: "unknown", status: "expired" as const };
      }

      const portContext = {
        companyId,
        actorUserId: user.id,
        isSuperAdmin,
        hasPermission,
      };
      const registry = createLoginAppApplicationLayerRegistry(portContext);
      const context = buildApplicationContext({
        tenantId: companyId,
        actorId: user.id,
        permissions: permissionCodes(hasPermission, isSuperAdmin),
      });

      const result = await registry.getServices().licensing.canAccess({ featureKey: unifiedKey }, context);
      return result.data ?? {
        allowed: false,
        planCode: "unknown",
        status: "expired" as const,
        reason: "Access unresolved",
      };
    },
  });

  return {
    isLoading: query.isLoading,
    // Commercial modules deny while loading; unmapped legacy flags keep prior default.
    allowed: query.data?.allowed ?? (commercialMapped ? false : true),
    reason: query.data?.reason,
    planCode: query.data?.planCode,
    status: query.data?.status,
  };
}
