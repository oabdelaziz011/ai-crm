import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPluginPlatformServices } from "@/lib/plugins/services/plugin-platform-factory";
import {
  marketplaceAuditKey,
  marketplaceCatalogKey,
  marketplaceInstalledKey,
  marketplaceMonitoringKey,
  marketplaceOverviewKey,
  MARKETPLACE_CACHE_STALE_MS,
} from "@/lib/plugins/cache/query-keys";
import type { PluginPermission } from "@/lib/plugins/types";

const plugins = getPluginPlatformServices();

export function useMarketplaceOverview(companyId: string | null) {
  return useQuery({
    queryKey: marketplaceOverviewKey(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: MARKETPLACE_CACHE_STALE_MS,
    queryFn: () => plugins.getOverview(companyId!),
  });
}

export function useMarketplaceCatalog() {
  return useQuery({
    queryKey: marketplaceCatalogKey(),
    staleTime: MARKETPLACE_CACHE_STALE_MS,
    queryFn: () => plugins.catalog.list(),
  });
}

export function useInstalledPlugins(companyId: string | null) {
  return useQuery({
    queryKey: marketplaceInstalledKey(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: MARKETPLACE_CACHE_STALE_MS,
    queryFn: () => plugins.installations.list(companyId!),
  });
}

export function usePluginMonitoring(companyId: string | null) {
  return useQuery({
    queryKey: marketplaceMonitoringKey(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: MARKETPLACE_CACHE_STALE_MS,
    queryFn: () => plugins.getMonitoring(companyId!),
  });
}

export function usePluginAuditLog(companyId: string | null) {
  return useQuery({
    queryKey: marketplaceAuditKey(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: MARKETPLACE_CACHE_STALE_MS,
    queryFn: () => plugins.getAuditLog(companyId!),
  });
}

export function useInstallPlugin(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ registryId, permissions, actorId }: { registryId: string; permissions: PluginPermission[]; actorId?: string }) =>
      plugins.installations.install(companyId!, registryId, permissions, actorId),
    onSuccess: () => {
      if (companyId) {
        void qc.invalidateQueries({ queryKey: marketplaceInstalledKey(companyId) });
        void qc.invalidateQueries({ queryKey: marketplaceOverviewKey(companyId) });
      }
    },
  });
}

export function useEnablePlugin(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ installationId, actorId }: { installationId: string; actorId?: string }) =>
      plugins.installations.enable(companyId!, installationId, actorId),
    onSuccess: () => {
      if (companyId) void qc.invalidateQueries({ queryKey: marketplaceInstalledKey(companyId) });
    },
  });
}

export function useDisablePlugin(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ installationId, actorId }: { installationId: string; actorId?: string }) =>
      plugins.installations.disable(companyId!, installationId, actorId),
    onSuccess: () => {
      if (companyId) void qc.invalidateQueries({ queryKey: marketplaceInstalledKey(companyId) });
    },
  });
}

export function useUninstallPlugin(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ installationId, actorId }: { installationId: string; actorId?: string }) =>
      plugins.installations.uninstall(companyId!, installationId, actorId),
    onSuccess: () => {
      if (companyId) {
        void qc.invalidateQueries({ queryKey: marketplaceInstalledKey(companyId) });
        void qc.invalidateQueries({ queryKey: marketplaceOverviewKey(companyId) });
      }
    },
  });
}
