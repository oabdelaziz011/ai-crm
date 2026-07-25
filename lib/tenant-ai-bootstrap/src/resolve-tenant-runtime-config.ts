import type { SupabaseClient } from "@supabase/supabase-js";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { createEmbeddingPlatformServices } from "@workspace/embedding-platform";
import { createVectorStoreServices } from "@workspace/vector-store";
import { DEFAULT_COLLECTION_NAME } from "./constants.js";
import type { ServiceContext } from "./types.js";

export type TenantKnowledgeRetrievalConfig = {
  embeddingConnectionId: string;
  vectorStoreConnectionId: string;
  collectionId: string;
};

export type TenantRuntimeConfig = {
  aiAssistantId: string;
  providerConnectionId: string;
  knowledgeRetrieval: TenantKnowledgeRetrievalConfig | null;
  ready: boolean;
  missing: Array<"assistant" | "provider" | "embedding" | "vector_store" | "collection">;
};

export function pickDefaultConnection<T extends { is_default?: boolean; is_enabled?: boolean }>(
  connections: T[],
): T | null {
  return (
    connections.find((item) => item.is_default && item.is_enabled) ??
    connections.find((item) => item.is_enabled) ??
    null
  );
}

function createResolverContext(companyId: string): ServiceContext {
  return {
    userId: null,
    companyId,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

export async function resolveTenantRuntimeConfig(
  client: SupabaseClient,
  companyId: string,
): Promise<TenantRuntimeConfig> {
  const ctx = createResolverContext(companyId);
  const missing: TenantRuntimeConfig["missing"] = [];

  const providerServices = createAIProviderServices(client);
  const embeddingServices = createEmbeddingPlatformServices(client);
  const vectorStoreServices = createVectorStoreServices(client);

  const { data: assistant } = await client
    .from("ai_assistant_settings")
    .select("id, knowledge_enabled")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!assistant?.id) {
    missing.push("assistant");
  }

  const providerConnections = await providerServices.registry.listConnections(ctx, {
    companyId,
    isEnabled: true,
  });
  const providerConnection = pickDefaultConnection(providerConnections);
  if (!providerConnection) {
    missing.push("provider");
  }

  const knowledgeEnabled = assistant?.knowledge_enabled !== false;
  let knowledgeRetrieval: TenantKnowledgeRetrievalConfig | null = null;

  if (knowledgeEnabled) {
    const embeddingConnections = await embeddingServices.registry.listConnections(ctx, {
      companyId,
      isEnabled: true,
    });
    const embeddingConnection = pickDefaultConnection(embeddingConnections);

    const vectorConnections = await vectorStoreServices.registry.listConnections(ctx, {
      companyId,
      isEnabled: true,
    });
    const vectorConnection = pickDefaultConnection(vectorConnections);

    const collections = vectorConnection
      ? await vectorStoreServices.collections.listCollections(ctx, {
          companyId,
          connectionId: vectorConnection.id,
        })
      : [];

    const activeCollection =
      collections.find((item) => item.name === DEFAULT_COLLECTION_NAME && item.is_active) ??
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

  const ready = Boolean(assistant?.id && providerConnection);

  return {
    aiAssistantId: assistant?.id ?? "",
    providerConnectionId: providerConnection?.id ?? "",
    knowledgeRetrieval,
    ready,
    missing,
  };
}
