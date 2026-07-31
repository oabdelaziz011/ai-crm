import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useAiProviderConnectionsAdmin } from "@/hooks/use-ai-provider-connections-admin";
import { useRuntimeChatConfig } from "@/hooks/ai-chat/use-runtime-chat-config";
import { useVectorStoreServices } from "@/lib/vector-store";
import {
  aiEmployeeRuntimePreviewKey,
  invalidateAiEmployeeQueries,
} from "@/lib/ai-employees/cache";
import { getAiEmployeeServices } from "@/lib/ai-employees";
import { resolveProviderCapabilities } from "@/lib/ai-employees/adapters/model-capabilities-catalog";
import type { AiEmployeeConfigurationUpdate, AiEmployeeRecord } from "@/lib/ai-employees/types";
import { useAiEmployee } from "./use-ai-employees";

const services = getAiEmployeeServices();

export function useAiEmployeeRuntimePreview(companyId: string | null, agentId: string | null) {
  const employeeQuery = useAiEmployee(companyId, agentId);
  const knowledgeEnabled = Boolean(employeeQuery.data?.knowledgeSourceIds.length);
  const runtimeConfigQuery = useRuntimeChatConfig(companyId, knowledgeEnabled, null);
  const { data: providerConnections = [] } = useAiProviderConnectionsAdmin(companyId);
  const { services: vectorServices, context: vectorContext } = useVectorStoreServices();

  return useQuery({
    queryKey: aiEmployeeRuntimePreviewKey(companyId, agentId),
    enabled: Boolean(companyId && agentId && employeeQuery.data),
    staleTime: 30_000,
    queryFn: async () => {
      const employee = employeeQuery.data as AiEmployeeRecord;
      const runtimeConfig = runtimeConfigQuery.data ?? {
        providerConnectionId: null,
        knowledgeRetrieval: null,
        ready: false,
        missing: ["provider"] as const,
      };

      const matchedConnection = providerConnections.find(
        (connection) =>
          connection.is_enabled &&
          connection.ai_provider_definition?.key === employee.provider,
      );
      const fallbackConnection = providerConnections.find((connection) => connection.is_enabled);

      const providerConnection = matchedConnection ?? fallbackConnection ?? null;
      const providerRegistryKey = providerConnection?.ai_provider_definition?.key ?? null;

      let collectionName: string | null = null;
      if (runtimeConfig.knowledgeRetrieval?.collectionId && companyId) {
        const collections = await vectorServices.collections.listCollections(vectorContext, {
          companyId,
          connectionId: runtimeConfig.knowledgeRetrieval.vectorStoreConnectionId,
        });
        collectionName =
          collections.find((item) => item.id === runtimeConfig.knowledgeRetrieval?.collectionId)?.name ??
          null;
      }

      const providerMeta = resolveProviderCapabilities(employee.provider);

      return services.configuration.buildRuntimePreview(employee, {
        companyId: companyId!,
        config: {
          ...runtimeConfig,
          providerConnectionId: providerConnection?.id ?? runtimeConfig.providerConnectionId,
        },
        providerConnectionName: providerConnection?.display_name ?? null,
        providerRegistryKey,
        collectionName,
        availableModels: providerMeta.models,
      });
    },
  });
}

export function useUpdateAiEmployeeConfiguration(companyId: string | null, agentId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (patch: AiEmployeeConfigurationUpdate) => {
      if (!companyId || !agentId) throw new Error("AI Employee required");
      return services.configuration.updateConfiguration(agentId, companyId, patch, user?.id ?? null);
    },
    onSettled: () => {
      invalidateAiEmployeeQueries(qc, companyId, agentId);
    },
  });
}

export function useAiEmployeeConfigurationState(companyId: string | null, agentId: string | null) {
  const employeeQuery = useAiEmployee(companyId, agentId);
  const previewQuery = useAiEmployeeRuntimePreview(companyId, agentId);

  return useMemo(
    () => ({
      employee: employeeQuery.data ?? null,
      preview: previewQuery.data ?? null,
      isLoading: employeeQuery.isLoading || previewQuery.isLoading,
      error: employeeQuery.error ?? previewQuery.error ?? null,
    }),
    [employeeQuery.data, employeeQuery.error, employeeQuery.isLoading, previewQuery.data, previewQuery.error, previewQuery.isLoading],
  );
}
