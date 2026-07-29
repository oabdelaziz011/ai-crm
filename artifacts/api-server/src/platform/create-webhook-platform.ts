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
  createInstagramWebhookHandler,
  createMessengerWebhookHandler,
  createSupabaseWhatsAppCredentialsLoader,
  createSupabaseInstagramCredentialsLoader,
  createSupabaseMessengerCredentialsLoader,
  ChannelWorkflowResolver,
  resolveWhatsAppCompanyChannel,
  resolveInstagramCompanyChannel,
  resolveMessengerCompanyChannel,
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
import { createEnterpriseRuntimeIntegrations } from "@workspace/ai-execution-engine";
import { createPlatformAIProviderServices } from "@workspace/platform-ai-provider";
import { resolveCompanyActorUserId } from "@workspace/automation-platform";
import { createWebhookToolRouterIntegrations } from "./create-webhook-tool-router-integrations.js";
import { createPlatformRuntimeConfigPort } from "./platform-runtime-port.js";
import { logger } from "../lib/logger.js";

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
  instagramHandler: ReturnType<typeof createInstagramWebhookHandler>;
  messengerHandler: ReturnType<typeof createMessengerWebhookHandler>;
  resolveRuntimeConfig: (companyId: string) => Promise<TenantRuntimeConfig | null>;
};

let cachedPlatform: WebhookPlatform | null = null;

export function createSupabaseServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for webhook processing.");
  }

  if (
    process.env.NODE_ENV === "production" &&
    key === process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ) {
    throw new Error("Service role key must not use the publishable Supabase key in production.");
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
  const platformServices = createPlatformAIProviderServices(client);
  const platformConfig = createPlatformRuntimeConfigPort(async ({ companyId, providerKey, useCase }) => {
    const runtime = await platformServices.platform.resolveRuntimeConfig(companyId, providerKey, useCase);
    return {
      apiKey: runtime.apiKey,
      model: runtime.model,
      baseUrl: runtime.baseUrl,
      providerKey: runtime.providerKey,
      usesPlatformKey: runtime.usesPlatformKey,
    };
  });
  const { tools } = createWebhookToolRouterIntegrations(client);
  const execution = createAIExecutionServices(
    client,
    createEnterpriseRuntimeIntegrations({
      promptRuntime: prompt.runtime,
      gateway: provider.gateway,
      knowledge: retrieval.knowledge,
      tools,
      platformConfig,
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
    {
      resolveRuntimeActorUserId: (companyId) => resolveCompanyActorUserId(client, companyId),
    },
  );

  const whatsAppCredentialsLoader = createSupabaseWhatsAppCredentialsLoader(client, {
    onDiagnostic: (detail) =>
      logger.info({ ...detail, event: "whatsapp.credentials" }, "WhatsApp credentials load"),
  });

  const instagramCredentialsLoader = createSupabaseInstagramCredentialsLoader(client);

  const messengerCredentialsLoader = createSupabaseMessengerCredentialsLoader(client);

  const channelPlatform = createChannelPlatformServices(client, {
    ports,
    workflowResolver,
    whatsAppCredentialsLoader,
    whatsAppOutboundDiagnostic: (detail) => logger.info({ ...detail, event: "whatsapp.outbound" }, "WhatsApp outbound diagnostic"),
    whatsAppDirectOutboundBypass:
      process.env.WHATSAPP_DIRECT_OUTBOUND_BYPASS === "true"
        ? {
            enabled: true,
            credentialsLoader: whatsAppCredentialsLoader,
            onResponse: (detail) =>
              logger.info(
                { ...detail, event: "whatsapp.direct_outbound_bypass" },
                "WhatsApp direct outbound bypass Graph API response",
              ),
          }
        : undefined,
    instagramCredentialsLoader,
    instagramOutboundDiagnostic: (detail) =>
      logger.info({ ...detail, event: "instagram.outbound" }, "Instagram outbound diagnostic"),
    messengerCredentialsLoader,
    messengerOutboundDiagnostic: (detail) =>
      logger.info({ ...detail, event: "messenger.outbound" }, "Messenger outbound diagnostic"),
  });

  const whatsAppHandler = createWhatsAppWebhookHandler({
    client,
    services: channelPlatform,
    ports,
    resolveSystemContext: () => SYSTEM_CONTEXT,
    resolveCompanyChannel: (companyChannelId) =>
      resolveWhatsAppCompanyChannel(ports, companyChannelId, whatsAppCredentialsLoader),
    resolveRuntimeConfig: async (companyId) => resolveRuntimeConfig(tenantRuntimeConfig, companyId),
  });

  const instagramHandler = createInstagramWebhookHandler({
    services: channelPlatform,
    ports,
    resolveSystemContext: () => SYSTEM_CONTEXT,
    resolveCompanyChannel: (companyChannelId) =>
      resolveInstagramCompanyChannel(ports, companyChannelId, instagramCredentialsLoader),
    resolveRuntimeConfig: async (companyId) => resolveRuntimeConfig(tenantRuntimeConfig, companyId),
  });

  const messengerHandler = createMessengerWebhookHandler({
    services: channelPlatform,
    ports,
    resolveSystemContext: () => SYSTEM_CONTEXT,
    resolveCompanyChannel: (companyChannelId) =>
      resolveMessengerCompanyChannel(ports, companyChannelId, messengerCredentialsLoader),
    resolveRuntimeConfig: async (companyId) => resolveRuntimeConfig(tenantRuntimeConfig, companyId),
  });

  cachedPlatform = {
    client,
    channelPlatform,
    ports,
    whatsAppHandler,
    instagramHandler,
    messengerHandler,
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
