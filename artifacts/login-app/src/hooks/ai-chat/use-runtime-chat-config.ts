import { useQuery } from "@tanstack/react-query";
import { PLATFORM_AI_FEATURE_KEY, createPlatformAIProviderServices } from "@workspace/platform-ai-provider";
import type { RuntimeChatExecutionConfig } from "@/lib/runtime-integration/chat-config";
import { pickDefaultConnection } from "@/lib/runtime-integration/chat-config";
import { isKnowledgeRetrievalEligible } from "@/lib/platform-ai/knowledge-access";
import { assistantProviderToRegistryKey } from "@/lib/ai-provider/provider-key-map";
import type { AiAssistantProvider } from "@/lib/types";
import { useAIProviderServices } from "@/lib/ai-provider-layer";
import { useEmbeddingPlatformServices } from "@/lib/embedding-platform";
import { useVectorStoreServices } from "@/lib/vector-store";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { LEGACY_AI_FEATURE_KEY_MAP } from "@workspace/configuration-platform";
import { supabase } from "@/lib/supabase";

export function runtimeChatConfigQueryKey(
  companyId: string | null,
  knowledgeEnabled: boolean,
  assistantProvider?: AiAssistantProvider | null,
) {
  return ["runtime-chat-config", companyId, knowledgeEnabled, assistantProvider ?? null] as const;
}

/**
 * Resolves provider and knowledge connection IDs for the Runtime Coordinator.
 * Feature flags resolve through FeatureFlagApplicationService only.
 *
 * Provider resolution is platform-first:
 * entitled company + active platform AI provider → auto-ensure keyless binding.
 * Companies are NOT required to enter their own API key.
 */
export function useRuntimeChatConfig(
  companyId: string | null,
  knowledgeEnabled: boolean,
  assistantProvider?: AiAssistantProvider | null,
) {
  const { services: providerServices, context: providerContext } = useAIProviderServices();
  const { services: embeddingServices, context: embeddingContext } = useEmbeddingPlatformServices();
  const { services: vectorStoreServices, context: vectorStoreContext } = useVectorStoreServices();
  const aiChatFlag = useFeatureFlag(LEGACY_AI_FEATURE_KEY_MAP[PLATFORM_AI_FEATURE_KEY.AI_CHAT] ?? PLATFORM_AI_FEATURE_KEY.AI_CHAT);
  const knowledgeFlag = useFeatureFlag(LEGACY_AI_FEATURE_KEY_MAP[PLATFORM_AI_FEATURE_KEY.KNOWLEDGE] ?? PLATFORM_AI_FEATURE_KEY.KNOWLEDGE);

  return useQuery({
    queryKey: [
      ...runtimeChatConfigQueryKey(companyId, knowledgeEnabled, assistantProvider),
      aiChatFlag.isEnabled,
      knowledgeFlag.isEnabled,
    ],
    enabled: Boolean(companyId) && !aiChatFlag.isLoading,
    staleTime: 60_000,
    queryFn: async (): Promise<RuntimeChatExecutionConfig> => {
      if (!companyId) {
        return {
          providerConnectionId: null,
          knowledgeRetrieval: null,
          ready: false,
          missing: ["provider"],
          platformProviderReady: false,
          errorCode: "AI_PROVIDER_NOT_CONFIGURED",
        };
      }

      const missing: RuntimeChatExecutionConfig["missing"] = [];

      if (!aiChatFlag.isEnabled) {
        missing.push("provider");
        return {
          providerConnectionId: null,
          knowledgeRetrieval: null,
          ready: false,
          missing,
          platformProviderReady: false,
          errorCode: null,
        };
      }

      const preferredKey = assistantProvider
        ? assistantProviderToRegistryKey(assistantProvider)
        : "openai";

      const platformServices = createPlatformAIProviderServices(supabase);
      const ensured = await platformServices.platform.ensureCompanyProviderConnection(
        companyId,
        preferredKey,
      );

      let providerConnectionId = ensured.connectionId;
      const platformProviderReady = ensured.ready;

      if (!providerConnectionId) {
        const providerConnections = await providerServices.registry.listConnections(providerContext, {
          companyId,
          isEnabled: true,
        });
        const preferredConnections = providerConnections.filter(
          (connection) => connection.ai_provider_definition?.key === preferredKey,
        );
        const providerConnection = pickDefaultConnection(
          preferredConnections.length > 0 ? preferredConnections : providerConnections,
        );
        providerConnectionId = providerConnection?.id ?? null;
      }

      if (!providerConnectionId) {
        missing.push("provider");
      }

      let knowledgeRetrieval: RuntimeChatExecutionConfig["knowledgeRetrieval"] = null;

      if (
        isKnowledgeRetrievalEligible({
          aiChatEnabled: true,
          // Soft-allow while unresolved/default; only hard-block when explicitly false.
          knowledgeFeatureEnabled: knowledgeFlag.isEnabled !== false,
          assistantKnowledgeEnabled: knowledgeEnabled,
        })
      ) {
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
        providerConnectionId,
        knowledgeRetrieval,
        ready: Boolean(providerConnectionId),
        missing,
        platformProviderReady,
        errorCode: ensured.errorCode,
      };
    },
  });
}
