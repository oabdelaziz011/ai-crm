import { useQuery } from "@tanstack/react-query";
import type { RuntimeChatExecutionConfig } from "@/lib/runtime-integration/chat-config";
import { pickDefaultConnection } from "@/lib/runtime-integration/chat-config";
import { assistantProviderToRegistryKey } from "@/lib/ai-provider/provider-key-map";
import type { AiAssistantProvider } from "@/lib/types";
import { useAIProviderServices } from "@/lib/ai-provider-layer";
import { useEmbeddingPlatformServices } from "@/lib/embedding-platform";
import { useVectorStoreServices } from "@/lib/vector-store";

export function runtimeChatConfigQueryKey(
  companyId: string | null,
  knowledgeEnabled: boolean,
  assistantProvider?: AiAssistantProvider | null,
) {
  return ["runtime-chat-config", companyId, knowledgeEnabled, assistantProvider ?? null] as const;
}

/**
 * Resolves provider and knowledge connection IDs for the Runtime Coordinator.
 * Uses platform registries for configuration lookup only — never executes retrieval.
 */
export function useRuntimeChatConfig(
  companyId: string | null,
  knowledgeEnabled: boolean,
  assistantProvider?: AiAssistantProvider | null,
) {
  const { services: providerServices, context: providerContext } = useAIProviderServices();
  const { services: embeddingServices, context: embeddingContext } = useEmbeddingPlatformServices();
  const { services: vectorStoreServices, context: vectorStoreContext } = useVectorStoreServices();

  return useQuery({
    queryKey: runtimeChatConfigQueryKey(companyId, knowledgeEnabled, assistantProvider),
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<RuntimeChatExecutionConfig> => {
      if (!companyId) {
        return { providerConnectionId: null, knowledgeRetrieval: null, ready: false, missing: ["provider"] };
      }

      const missing: RuntimeChatExecutionConfig["missing"] = [];

      const providerConnections = await providerServices.registry.listConnections(providerContext, {
        companyId,
        isEnabled: true,
      });

      const preferredKey = assistantProvider
        ? assistantProviderToRegistryKey(assistantProvider)
        : null;
      const preferredConnections = preferredKey
        ? providerConnections.filter(
            (connection) => connection.ai_provider_definition?.key === preferredKey,
          )
        : providerConnections;

      const providerConnection = pickDefaultConnection(
        preferredConnections.length > 0 ? preferredConnections : providerConnections,
      );

      if (!providerConnection) {
        missing.push("provider");
      }

      let knowledgeRetrieval: RuntimeChatExecutionConfig["knowledgeRetrieval"] = null;

      if (knowledgeEnabled) {
        const embeddingConnections = await embeddingServices.registry.listConnections(embeddingContext, {
          companyId,
          isEnabled: true,
        });
        const embeddingConnection = pickDefaultConnection(embeddingConnections);

        const vectorConnections = await vectorStoreServices.registry.listConnections(vectorStoreContext, {
          companyId,
          isEnabled: true,
        });
        const vectorConnection = pickDefaultConnection(vectorConnections);

        const collections = vectorConnection
          ? await vectorStoreServices.collections.listCollections(vectorStoreContext, {
              companyId,
              connectionId: vectorConnection.id,
            })
          : [];

        const activeCollection =
          collections.find((item) => item.is_active && item.status === "active") ??
          collections.find((item) => item.is_active) ??
          collections[0] ??
          null;

        if (!embeddingConnection) missing.push("embedding");
        if (!vectorConnection) missing.push("vector_store");
        if (!activeCollection) missing.push("collection");

        if (embeddingConnection && vectorConnection && activeCollection) {
          knowledgeRetrieval = {
            embeddingConnectionId: embeddingConnection.id,
            vectorStoreConnectionId: vectorConnection.id,
            collectionId: activeCollection.id,
          };
        }
      }

      return {
        providerConnectionId: providerConnection?.id ?? null,
        knowledgeRetrieval,
        ready: Boolean(providerConnection),
        missing,
      };
    },
  });
}
