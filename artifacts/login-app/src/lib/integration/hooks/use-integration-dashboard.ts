import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIntegrationPlatformServices } from "@/lib/integration/services/integration-platform-factory";
import {
  integrationApiKeysKey,
  integrationDeliveriesKey,
  integrationMonitoringKey,
  integrationOverviewKey,
  integrationWebhooksKey,
  INTEGRATION_CACHE_STALE_MS,
} from "@/lib/integration/cache/query-keys";
import type { ApiScope, WebhookEventType } from "@/lib/integration/types";

const integration = getIntegrationPlatformServices();

export function useIntegrationOverview(companyId: string | null) {
  return useQuery({
    queryKey: integrationOverviewKey(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: INTEGRATION_CACHE_STALE_MS,
    queryFn: () => integration.getOverview(companyId!),
  });
}

export function useIntegrationApiKeys(companyId: string | null) {
  return useQuery({
    queryKey: integrationApiKeysKey(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: INTEGRATION_CACHE_STALE_MS,
    queryFn: () => integration.keys.list(companyId!),
  });
}

export function useIntegrationWebhooks(companyId: string | null) {
  return useQuery({
    queryKey: integrationWebhooksKey(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: INTEGRATION_CACHE_STALE_MS,
    queryFn: () => integration.subscriptions.list(companyId!),
  });
}

export function useIntegrationDeliveries(companyId: string | null) {
  return useQuery({
    queryKey: integrationDeliveriesKey(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: INTEGRATION_CACHE_STALE_MS,
    queryFn: () => integration.subscriptions.deliveries(companyId!),
  });
}

export function useIntegrationMonitoring(companyId: string | null) {
  return useQuery({
    queryKey: integrationMonitoringKey(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: INTEGRATION_CACHE_STALE_MS,
    queryFn: () => integration.monitoring.getMonitoring(companyId!),
  });
}

export function useCreateApiKey(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; scopes: ApiScope[]; createdBy?: string }) =>
      integration.keys.create({ companyId: companyId!, ...input }),
    onSuccess: () => {
      if (companyId) void qc.invalidateQueries({ queryKey: integrationApiKeysKey(companyId) });
    },
  });
}

export function useCreateWebhook(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; endpointUrl: string; eventTypes: WebhookEventType[] }) =>
      integration.subscriptions.create(companyId!, input.name, input.endpointUrl, input.eventTypes),
    onSuccess: () => {
      if (companyId) void qc.invalidateQueries({ queryKey: integrationWebhooksKey(companyId) });
    },
  });
}

export function useRetryWebhookDelivery(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) => integration.subscriptions.retry(companyId!, deliveryId),
    onSuccess: () => {
      if (companyId) void qc.invalidateQueries({ queryKey: integrationDeliveriesKey(companyId) });
    },
  });
}
