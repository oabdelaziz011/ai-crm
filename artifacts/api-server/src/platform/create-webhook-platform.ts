import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createConversationServices } from "@workspace/ai-conversation";
import { createAIExecutionServices } from "@workspace/ai-execution-engine";
import { createIntentEngineServices } from "@workspace/ai-intent-engine";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { createPromptOrchestratorServices } from "@workspace/ai-prompt-orchestrator";
import { createChannelRegistryServices } from "@workspace/channel-registry";
import { createWebhookAutomationPlatformServices } from "./create-webhook-automation-services.js";
import {
  createChannelPlatformServices,
  createSupabaseChannelWorkflowBindingRepository,
  createWhatsAppWebhookHandler,
  ChannelWorkflowResolver,
  resolveWhatsAppCompanyChannel,
  type ChannelPlatformPorts,
  type ChannelPlatformServices,
} from "@workspace/channel-platform";
import { createEmbeddingPlatformServices } from "@workspace/embedding-platform";
import { createRetrievalServices, createRetrievalPlatformPorts } from "@workspace/retrieval-engine";
import { createRuntimeIntegrationServices, NoopRuntimeTelemetryPort } from "@workspace/runtime-integration";
import { createTenantRuntimeConfigService } from "@workspace/tenant-ai-bootstrap/src/services/tenant-runtime-config-service.js";
import type { TenantRuntimeConfig } from "@workspace/tenant-ai-bootstrap/src/resolve-tenant-runtime-config.js";
import { createVectorQueryServices } from "@workspace/vector-query";
import { createVectorStoreServices } from "@workspace/vector-store";
import {
  createChannelPlatformPortsWithContext,
  createChannelRegistryPort,
  createChannelConversationPort,
  createChannelRuntimePort,
} from "./channel-platform-ports.js";
import { createChannelAutomationPortFromClient, createChannelWorkflowFlowValidator } from "./channel-automation-port.js";
import { createRuntimeEnginePortsWithContext } from "./runtime-engine-ports.js";
import { createEnterpriseRuntimeIntegrations } from "./runtime-adapters.js";

export type SystemServiceContext = {
  userId: null;
  companyId: null;
  isSuperAdmin: true;
  hasPermission: () => true;
};

const SYSTEM_CONTEXT: SystemServiceContext = {
  userId: null,
  companyId: null,
  isSuperAdmin: true,
  hasPermission: () => true,
};

export type WebhookPlatform = {
  client: SupabaseClient;
  channelPlatform: ChannelPlatformServices;
  ports: ChannelPlatformPorts;
  whatsAppHandler: ReturnType<typeof createWhatsAppWebhookHandler>;
  resolveRuntimeConfig: (companyId: string) => Promise<TenantRuntimeConfig | null>;
};

let cachedPlatform: WebhookPlatform | null = null;

export function createSupabaseServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for webhook processing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getWebhookPlatform(): WebhookPlatform {
  if (cachedPlatform) return cachedPlatform;

  const client = createSupabaseServiceClient();
  const channelRegistry = createChannelRegistryServices(client);
  const conversation = createConversationServices(client);
  const intent = createIntentEngineServices(client);
  const embedding = createEmbeddingPlatformServices(client);
  const vectorStore = createVectorStoreServices(client);
  const vectorQuery = createVectorQueryServices(client);
  const retrievalPlatformPorts = createRetrievalPlatformPorts({
    embedding: { registry: embedding.registry, factory: embedding.factory },
    vectorQuery: { management: vectorQuery.management },
  });
  const retrieval = createRetrievalServices(client, {
    queryEmbeddingPort: retrievalPlatformPorts.queryEmbeddingPort,
    vectorQueryPort: retrievalPlatformPorts.vectorQueryPort,
  });
  const prompt = createPromptOrchestratorServices(client);
  const provider = createAIProviderServices(client);
  const execution = createAIExecutionServices(
    client,
    createEnterpriseRuntimeIntegrations({
      promptRuntime: prompt.runtime,
      gateway: provider.gateway,
      knowledge: retrieval.knowledge,
    }),
  );
  const tenantRuntimeConfig = createTenantRuntimeConfigService(client);

  const runtimePorts = createRuntimeEnginePortsWithContext(
    { conversation, intent, vectorQuery, retrieval, prompt, execution, provider },
    SYSTEM_CONTEXT,
  );

  const runtime = createRuntimeIntegrationServices(client, {
    ports: runtimePorts,
    telemetry: new NoopRuntimeTelemetryPort(),
  });

  const automationPlatform = createWebhookAutomationPlatformServices(client);
  const workflowResolver = new ChannelWorkflowResolver({
    bindings: createSupabaseChannelWorkflowBindingRepository(client),
    flowValidator: createChannelWorkflowFlowValidator(client),
  });

  const ports = createChannelPlatformPortsWithContext(
    { channelRegistry, conversation, runtime, automation: automationPlatform.engine, supabaseClient: client },
    {
      registry: SYSTEM_CONTEXT,
      conversation: SYSTEM_CONTEXT,
      runtime: SYSTEM_CONTEXT,
      automation: SYSTEM_CONTEXT,
    },
  );

  const channelPlatform = createChannelPlatformServices(client, { ports, workflowResolver });

  const whatsAppHandler = createWhatsAppWebhookHandler({
    client,
    services: channelPlatform,
    ports,
    resolveSystemContext: () => SYSTEM_CONTEXT,
    resolveCompanyChannel: (companyChannelId) =>
      resolveWhatsAppCompanyChannel(ports, companyChannelId),
    resolveRuntimeConfig: async (companyId) => resolveRuntimeConfig(tenantRuntimeConfig, companyId),
  });

  cachedPlatform = {
    client,
    channelPlatform,
    ports,
    whatsAppHandler,
    resolveRuntimeConfig: (companyId) => resolveRuntimeConfig(tenantRuntimeConfig, companyId),
  };

  return cachedPlatform;
}

async function resolveRuntimeConfig(
  tenantRuntimeConfig: ReturnType<typeof createTenantRuntimeConfigService>,
  companyId: string,
): Promise<TenantRuntimeConfig | null> {
  if (process.env.WEBHOOK_EXECUTE_AI === "false") {
    return null;
  }

  const config = await tenantRuntimeConfig.ensureReady(companyId);
  if (!config.ready) {
    return null;
  }

  return config;
}

export { SYSTEM_CONTEXT, createChannelRegistryPort, createChannelConversationPort, createChannelRuntimePort };
