import type { SupabaseClient } from "@supabase/supabase-js";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { createEmbeddingPlatformServices } from "@workspace/embedding-platform";
import { PLATFORM_AI_FEATURE_KEY } from "@workspace/platform-ai-provider";
import { resolveFeatureEnabledViaApplicationLayer } from "@/lib/application-layer/resolve-feature-flag";
import { createVectorStoreServices } from "@workspace/vector-store";
import type { AgentRuntimeChannelBinding } from "@/lib/ai-employees/adapters/ai-employee-runtime-types";
import { resolveProviderCapabilities } from "@/lib/ai-employees/adapters/model-capabilities-catalog";
import { createAiEmployeeServices } from "@/lib/ai-employees";
import type { TenantRuntimeContext } from "./ai-employee-configuration-service";
import { evaluateEmployeeChannelRuntimeBinding } from "./evaluate-employee-channel-runtime-binding";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";
import { isKnowledgeRetrievalEligible } from "@/lib/platform-ai/knowledge-access";
import { pickDefaultConnection, type RuntimeChatExecutionConfig } from "@/lib/runtime-integration/chat-config";
import { supabase } from "@/lib/supabase";

const RUNTIME_BINDING_TTL_MS = 60_000;

type RuntimeBindingCacheEntry = {
  expiresAt: number;
  value: Promise<AgentRuntimeChannelBinding | null>;
};

const runtimeBindingCache = new Map<string, RuntimeBindingCacheEntry>();

function createCompanyServiceContext(companyId: string) {
  return {
    userId: null,
    companyId,
    actorUserId: "system",
    isSuperAdmin: false,
    hasPermission: () => true,
  };
}

async function loadRuntimeChatConfig(
  client: SupabaseClient,
  companyId: string,
  knowledgeEnabled: boolean,
): Promise<RuntimeChatExecutionConfig> {
  const portContext = createCompanyServiceContext(companyId);
  const providerContext = { userId: null, companyId, isSuperAdmin: false, hasPermission: () => true };
  const providerServices = createAIProviderServices(client);
  const embeddingServices = createEmbeddingPlatformServices(client);
  const vectorStoreServices = createVectorStoreServices(client);

  const missing: RuntimeChatExecutionConfig["missing"] = [];

  const [aiChatEnabled, knowledgeFeatureEnabled, providerConnections] = await Promise.all([
    resolveFeatureEnabledViaApplicationLayer(portContext, PLATFORM_AI_FEATURE_KEY.AI_CHAT),
    resolveFeatureEnabledViaApplicationLayer(portContext, PLATFORM_AI_FEATURE_KEY.KNOWLEDGE),
    providerServices.registry.listConnections(providerContext, {
      companyId,
      isEnabled: true,
    }),
  ]);

  if (!aiChatEnabled) {
    missing.push("provider");
    return {
      providerConnectionId: null,
      knowledgeRetrieval: null,
      ready: false,
      missing,
    };
  }

  const providerConnection = pickDefaultConnection(providerConnections);
  if (!providerConnection) {
    missing.push("provider");
  }

  let knowledgeRetrieval: RuntimeChatExecutionConfig["knowledgeRetrieval"] = null;

  if (
    isKnowledgeRetrievalEligible({
      aiChatEnabled: true,
      knowledgeFeatureEnabled,
      assistantKnowledgeEnabled: knowledgeEnabled,
    })
  ) {
    const [embeddingConnections, vectorConnections] = await Promise.all([
      embeddingServices.registry.listConnections(providerContext, {
        companyId,
        isEnabled: true,
      }),
      vectorStoreServices.registry.listConnections(providerContext, {
        companyId,
        isEnabled: true,
      }),
    ]);
    const embeddingConnection = pickDefaultConnection(embeddingConnections);
    const vectorConnection = pickDefaultConnection(vectorConnections);

    const collections = vectorConnection
      ? await vectorStoreServices.collections.listCollections(providerContext, {
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
}

async function loadTenantRuntimeContext(
  client: SupabaseClient,
  companyId: string,
  employee: AiEmployeeRecord,
): Promise<TenantRuntimeContext> {
  const context = createCompanyServiceContext(companyId);
  const providerServices = createAIProviderServices(client);
  const vectorStoreServices = createVectorStoreServices(client);
  const knowledgeEnabled = employee.knowledgeSourceIds.length > 0;

  const [runtimeConfig, providerConnections] = await Promise.all([
    loadRuntimeChatConfig(client, companyId, knowledgeEnabled),
    providerServices.registry.listConnections(context, { companyId, isEnabled: true }),
  ]);

  const matchedConnection = providerConnections.find(
    (connection) =>
      connection.is_enabled && connection.ai_provider_definition?.key === employee.provider,
  );
  const fallbackConnection = providerConnections.find((connection) => connection.is_enabled);
  const providerConnection = matchedConnection ?? fallbackConnection ?? null;
  const providerRegistryKey = providerConnection?.ai_provider_definition?.key ?? null;

  let collectionName: string | null = null;
  if (runtimeConfig.knowledgeRetrieval?.collectionId) {
    const collections = await vectorStoreServices.collections.listCollections(context, {
      companyId,
      connectionId: runtimeConfig.knowledgeRetrieval.vectorStoreConnectionId,
    });
    collectionName =
      collections.find((item) => item.id === runtimeConfig.knowledgeRetrieval?.collectionId)?.name ?? null;
  }

  const providerMeta = resolveProviderCapabilities(employee.provider);

  return {
    companyId,
    config: {
      ...runtimeConfig,
      providerConnectionId: providerConnection?.id ?? runtimeConfig.providerConnectionId,
    },
    providerConnectionName: providerConnection?.display_name ?? null,
    providerRegistryKey,
    collectionName,
    availableModels: providerMeta.models,
  };
}

export { evaluateEmployeeChannelRuntimeBinding } from "./evaluate-employee-channel-runtime-binding";

async function resolveEmployeeChannelRuntimeUncached(
  companyId: string,
  aiEmployeeId: string,
  client: SupabaseClient,
): Promise<AgentRuntimeChannelBinding | null> {
  const services = createAiEmployeeServices(client);
  const employee = await services.registry.getById(aiEmployeeId, companyId);
  if (!employee) return null;

  const tenantRuntime = await loadTenantRuntimeContext(client, companyId, employee);
  const preview = await services.configuration.buildRuntimePreview(employee, tenantRuntime);
  return evaluateEmployeeChannelRuntimeBinding(employee, preview);
}

/**
 * Resolve channel runtime binding with a short in-process TTL cache.
 * WhatsApp inbound previously resolved the same employee 2–3× per message (~4–8s).
 */
export async function resolveEmployeeChannelRuntime(
  companyId: string,
  aiEmployeeId: string,
  client: SupabaseClient = supabase,
): Promise<AgentRuntimeChannelBinding | null> {
  const cacheKey = `${companyId}:${aiEmployeeId}`;
  const now = Date.now();
  const hit = runtimeBindingCache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  const value = resolveEmployeeChannelRuntimeUncached(companyId, aiEmployeeId, client).catch((error) => {
    runtimeBindingCache.delete(cacheKey);
    throw error;
  });
  runtimeBindingCache.set(cacheKey, { expiresAt: now + RUNTIME_BINDING_TTL_MS, value });
  return value;
}

/** Test helper — clears the in-process binding cache. */
export function clearEmployeeChannelRuntimeCache(): void {
  runtimeBindingCache.clear();
}
