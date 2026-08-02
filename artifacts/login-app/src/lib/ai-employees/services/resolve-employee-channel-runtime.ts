import type { SupabaseClient } from "@supabase/supabase-js";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { createEmbeddingPlatformServices } from "@workspace/embedding-platform";
import { createPlatformAIProviderServices, PLATFORM_AI_FEATURE_KEY } from "@workspace/platform-ai-provider";
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

function createCompanyServiceContext(companyId: string) {
  return {
    userId: null,
    companyId,
    isSuperAdmin: false,
    hasPermission: () => false,
  };
}

async function loadRuntimeChatConfig(
  client: SupabaseClient,
  companyId: string,
  knowledgeEnabled: boolean,
): Promise<RuntimeChatExecutionConfig> {
  const context = createCompanyServiceContext(companyId);
  const providerServices = createAIProviderServices(client);
  const platformServices = createPlatformAIProviderServices(client);
  const embeddingServices = createEmbeddingPlatformServices(client);
  const vectorStoreServices = createVectorStoreServices(client);

  const missing: RuntimeChatExecutionConfig["missing"] = [];

  const aiChatEnabled = await platformServices.platform.isFeatureEnabled(
    companyId,
    PLATFORM_AI_FEATURE_KEY.AI_CHAT,
  );
  if (!aiChatEnabled) {
    missing.push("provider");
    return {
      providerConnectionId: null,
      knowledgeRetrieval: null,
      ready: false,
      missing,
    };
  }

  const providerConnections = await providerServices.registry.listConnections(context, {
    companyId,
    isEnabled: true,
  });
  const providerConnection = pickDefaultConnection(providerConnections);
  if (!providerConnection) {
    missing.push("provider");
  }

  let knowledgeRetrieval: RuntimeChatExecutionConfig["knowledgeRetrieval"] = null;
  const knowledgeFeatureEnabled = await platformServices.platform.isFeatureEnabled(
    companyId,
    PLATFORM_AI_FEATURE_KEY.KNOWLEDGE,
  );

  if (
    isKnowledgeRetrievalEligible({
      aiChatEnabled: true,
      knowledgeFeatureEnabled,
      assistantKnowledgeEnabled: knowledgeEnabled,
    })
  ) {
    const embeddingConnections = await embeddingServices.registry.listConnections(context, {
      companyId,
      isEnabled: true,
    });
    const embeddingConnection = pickDefaultConnection(embeddingConnections);

    const vectorConnections = await vectorStoreServices.registry.listConnections(context, {
      companyId,
      isEnabled: true,
    });
    const vectorConnection = pickDefaultConnection(vectorConnections);

    const collections = vectorConnection
      ? await vectorStoreServices.collections.listCollections(context, {
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

export async function resolveEmployeeChannelRuntime(
  companyId: string,
  aiEmployeeId: string,
  client: SupabaseClient = supabase,
): Promise<AgentRuntimeChannelBinding | null> {
  const services = createAiEmployeeServices(client);
  const employee = await services.registry.getById(aiEmployeeId, companyId);
  if (!employee) return null;

  const tenantRuntime = await loadTenantRuntimeContext(client, companyId, employee);
  const preview = await services.configuration.buildRuntimePreview(employee, tenantRuntime);
  return evaluateEmployeeChannelRuntimeBinding(employee, preview);
}
