import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createConversationServices } from "@workspace/ai-conversation";
import { createAIExecutionServices } from "@workspace/ai-execution-engine";
import { createIntentEngineServices, createLlmEmailRoutingClassifier, createEmailRoutingEngine } from "@workspace/ai-intent-engine";
import { createSupabaseEmailRoutingTargetResolver } from "./email-routing-target-resolver-adapter.js";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { createPromptOrchestratorServices } from "@workspace/ai-prompt-orchestrator";
import { createChannelRegistryServices } from "@workspace/channel-registry";
import { createWebhookAutomationPlatformServices } from "./create-webhook-automation-services.js";
import {
  createServerChannelPlatformServices,
  createSupabaseChannelWorkflowBindingRepository,
  createWhatsAppWebhookHandler,
  createInstagramWebhookHandler,
  createMessengerWebhookHandler,
  createEmailWebhookHandler,
  createSupabaseWhatsAppCredentialsLoader,
  createSupabaseWhatsAppCredentialLifecycle,
  createSupabaseInstagramCredentialsLoader,
  createSupabaseMessengerCredentialsLoader,
  createSupabaseEmailCredentialsLoader,
  createSupabaseEmailThreadLookup,
  createEmailPollingWorker,
  createEmailImapClient,
  ChannelWorkflowResolver,
  resolveWhatsAppCompanyChannel,
  resolveInstagramCompanyChannel,
  resolveMessengerCompanyChannel,
  resolveEmailCompanyChannel,
  isWhatsAppDirectOutboundBypassAllowed,
  type ChannelPlatformPorts,
  type ChannelPlatformServices,
} from "@workspace/channel-platform";
import { createCampaignDeliveryReconcilePort } from "@login-app/lib/campaigns/reconcile-campaign-recipient-delivery";
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
import { createSupabaseConversationAttachmentUrlPort } from "./conversation-attachment-url-port.js";
import { createChannelWorkflowFlowValidator } from "./channel-automation-port.js";
import { createRuntimeEnginePortsWithContext } from "./runtime-engine-ports.js";
import { createCustomer360Loader, createSupabaseCustomer360DataPort } from "@workspace/customer-360";
import { createSupabaseInboundAiGatePort } from "@workspace/human-handoff-platform";
import { createTicketPlatformServices } from "@workspace/ticket-platform";
import { createLeadPlatformServices } from "@workspace/lead-platform";
import { createKnowledgeRuntimeProvider, createCrmRagKnowledgeRetriever } from "@workspace/knowledge-runtime";
import { createEnterpriseRuntimeIntegrations } from "@workspace/ai-execution-engine";
import { createPlatformAIProviderServices } from "@workspace/platform-ai-provider";
import { resolveCompanyActorUserId } from "@workspace/automation-platform";
import { createWebhookToolRouterIntegrations } from "./create-webhook-tool-router-integrations.js";
import { createWebhookWorkflowTransferPorts, buildWebhookWorkflowTransferServiceContext } from "./webhook-workflow-transfer-ports.js";
import { createWebhookPlatformFeatureResolver } from "./webhook-ai-workflow-bridge.js";
import { createWebhookEmployeeRuntimePort } from "./webhook-employee-runtime-port.js";
import { createWebhookChannelCustomerIdentityPort } from "./webhook-channel-customer-identity-port.js";
import { createScopedRuntimeToolPort } from "./employee-runtime-bridge.js";
import { createRpcCommercialEntitlementPort } from "@login-app/lib/ai-employees/utilities/ai-employee-commercial-runtime-gate.js";
import { createPlatformRuntimeConfigPort } from "./platform-runtime-port.js";
import { createEmailRoutingTicketActionPort } from "./email-routing-ticket-adapter.js";
import { createAiEmailRoutingCommercialPort } from "./ai-email-routing-commercial-adapter.js";
import { createAiEmployeeEmailCommercialPort } from "./ai-employee-email-commercial-adapter.js";
import { createWhatsAppMessagesCommercialPort } from "./whatsapp-messages-commercial-adapter.js";
import { createChannelCommercialEntitlementPort } from "./channel-commercial-entitlement-adapter.js";
import { createAiTokensCommercialPort } from "./ai-tokens-commercial-adapter.js";
import { fetchImapRuntimeMessages } from "./email-imap-runtime.js";
import { logger } from "../lib/logger.js";
import { instrumentSupabaseClientForWhatsAppPerf } from "@workspace/channel-platform/server";
import { WA_REQUEST_CACHE_NS, waRequestGetOrLoad } from "@workspace/channel-platform";

/**
 * Technical service identity for channel registry / conversation / automation wiring.
 * Uses elevated flags only to satisfy service-layer interfaces while the API runs with
 * the Supabase service-role client.
 *
 * Phase 5E: This MUST NOT be used as the Product ServiceContext for AI Employee tool
 * execution. Channel runtime execute() uses createWebhookAiEmployeeServiceContext instead
 * (isSuperAdmin: false + constrained hasPermission).
 */
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
  emailHandler: ReturnType<typeof createEmailWebhookHandler>;
  emailPollingWorker: ReturnType<typeof createEmailPollingWorker>;
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

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Emit Supabase query stages when an inbound WhatsApp profiler is active.
  return instrumentSupabaseClientForWhatsAppPerf(client);
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
  const retrievalPlatformPorts = createRetrievalPlatformPorts({
    embedding: { registry: embedding.registry, factory: embedding.factory },
    vectorQuery: { management: vectorQuery.management },
    resolvePlatformConfiguration: async ({ companyId, providerKey }) => {
      const runtime = await platformServices.platform.resolveRuntimeConfig(companyId, providerKey, "embeddings");
      return {
        apiKey: runtime.apiKey,
        model: runtime.model,
        baseUrl: runtime.baseUrl,
      };
    },
  });
  const retrieval = createRetrievalServices(client, {
    queryEmbeddingPort: retrievalPlatformPorts.queryEmbeddingPort,
    vectorQueryPort: retrievalPlatformPorts.vectorQueryPort,
  });

  const aiTokensCommercial = createAiTokensCommercialPort(client);

  // Enterprise runtime without tools is enough for AI Extract / Decision on the webhook path.
  // Tools need the automation engine (circular), so employee tooling uses a second runtime below.
  const workflowAiExecution = createAIExecutionServices(
    client,
    createEnterpriseRuntimeIntegrations({
      promptRuntime: prompt.runtime,
      gateway: provider.gateway,
      knowledge: retrieval.knowledge,
      platformConfig,
    }),
    { aiTokensCommercial },
  );
  if (!workflowAiExecution.enterpriseRuntime) {
    throw new Error("Enterprise AI runtime is required for webhook AI workflow nodes.");
  }

  const automationPlatform = createWebhookAutomationPlatformServices(client, {
    enterpriseRuntime: workflowAiExecution.enterpriseRuntime,
    knowledge: retrieval.knowledge,
  });
  const workflowTransferPorts = createWebhookWorkflowTransferPorts(client, automationPlatform.engine);

  const tenantRuntimeConfig = createTenantRuntimeConfigService(client);
  const knowledgeRuntimeProvider = createKnowledgeRuntimeProvider(retrieval.knowledge, {
    embeddingQueue: {
      async queuePendingEmbeddings(input) {
        const { data: documents } = await client
          .from("knowledge_documents")
          .select("id, version_id, company_id, metadata")
          .eq("company_id", input.companyId)
          .in("metadata->publishing->>embedding_status", ["pending", "failed"])
          .limit(5);

        if (!documents?.length) return;

        await Promise.allSettled(
          documents.map((document) =>
            embedding.queue.buildQueueForPublishedDocument(SYSTEM_CONTEXT, {
              companyId: document.company_id,
              documentId: document.id,
              versionId: document.version_id,
            }),
          ),
        );
      },
    },
  });

  const retrieveKnowledge = createCrmRagKnowledgeRetriever({
    knowledgeRuntime: knowledgeRuntimeProvider,
    resolveRetrievalConfig: async (companyId) => {
      const config = await tenantRuntimeConfig.resolve(companyId);
      return config.knowledgeRetrieval;
    },
  });

  const { tools: baseTools } = createWebhookToolRouterIntegrations(client, {
    workflowTransferPorts,
    retrieveKnowledge,
  });
  const tools = createScopedRuntimeToolPort(baseTools, {
    commercialEntitlement: createRpcCommercialEntitlementPort(client),
  });
  const execution = createAIExecutionServices(
    client,
    createEnterpriseRuntimeIntegrations({
      promptRuntime: prompt.runtime,
      gateway: provider.gateway,
      knowledge: retrieval.knowledge,
      tools,
      platformConfig,
    }),
    { aiTokensCommercial },
  );

  const runtimePorts = createRuntimeEnginePortsWithContext(
    { conversation, intent, vectorQuery, retrieval, prompt, execution, provider },
    SYSTEM_CONTEXT,
    {
      customer360Loader: createCustomer360Loader(createSupabaseCustomer360DataPort(client, {
        resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
        ticketReads: createTicketPlatformServices(client).reads,
        leadReads: createLeadPlatformServices(client).reads,
      })),
      knowledgeRuntimeProvider,
      resolveActorUserId: (companyId) => resolveCompanyActorUserId(client, companyId),
      promptMode: "webhook",
      loadConversationSchedulingToolSeed: async (conversationId) => {
        const { data, error } = await client
          .from("tool_executions")
          .select("id, tool_key, status, input, output")
          .eq("conversation_id", conversationId)
          .in("tool_key", ["search_availability", "find_next_available", "recommend_appointment"])
          .eq("status", "succeeded")
          .order("started_at", { ascending: false })
          .limit(3);
        if (error || !data?.length) return [];
        return data.map((row) => ({
          toolKey: String(row.tool_key ?? ""),
          executionId: String(row.id ?? ""),
          status: String(row.status ?? "succeeded"),
          input:
            row.input && typeof row.input === "object" && !Array.isArray(row.input)
              ? (row.input as Record<string, unknown>)
              : null,
          output:
            row.output && typeof row.output === "object" && !Array.isArray(row.output)
              ? (row.output as Record<string, unknown>)
              : null,
          durationMs: 0,
        }));
      },
    },
  );

  const runtime = createRuntimeIntegrationServices(client, {
    ports: runtimePorts,
    telemetry: new NoopRuntimeTelemetryPort(),
  });

  const workflowResolver = new ChannelWorkflowResolver({
    bindings: createSupabaseChannelWorkflowBindingRepository(client),
    flowValidator: createChannelWorkflowFlowValidator(client),
  });

  const employeeRuntime = createWebhookEmployeeRuntimePort(client);
  const customerIdentity = createWebhookChannelCustomerIdentityPort(client);

  // Part 6C: inbound ports.automation must NOT use SYSTEM_CONTEXT.
  // Per-call company-scoped context = commercial∩platform kill-switch + narrow automation.execute.
  const resolveInboundAutomationPlatformFeature = createWebhookPlatformFeatureResolver(client);
  const resolveInboundAutomationServiceContext = (companyId: string) =>
    buildWebhookWorkflowTransferServiceContext({
      companyId,
      resolvePlatformFeatureEnabled: resolveInboundAutomationPlatformFeature,
    });

  const ports = createChannelPlatformPortsWithContext(
    {
      channelRegistry,
      conversation,
      runtime,
      automation: automationPlatform.engine,
      supabaseClient: client,
      employeeRuntime,
      customerIdentity,
    },
    {
      registry: SYSTEM_CONTEXT,
      conversation: SYSTEM_CONTEXT,
      runtime: SYSTEM_CONTEXT,
      automation: {
        resolveServiceContext: resolveInboundAutomationServiceContext,
      },
    },
    {
      resolveRuntimeActorUserId: (companyId) => resolveCompanyActorUserId(client, companyId),
    },
  );
  ports.inboundAutomationGate = createSupabaseInboundAiGatePort(client, {
    getConversation: async (companyId, conversationId) => {
      try {
        const record = await conversation.conversations.getConversation(SYSTEM_CONTEXT, conversationId);
        if (record.company_id !== companyId) return null;
        return {
          assignedUserId: record.assigned_user_id ?? null,
          state: record.state ?? null,
        };
      } catch {
        return null;
      }
    },
  });
  ports.emailRoutingTickets = createEmailRoutingTicketActionPort(client, {
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
  });
  ports.aiEmailRoutingCommercial = createAiEmailRoutingCommercialPort(client);
  ports.aiEmployeeEmailCommercial = createAiEmployeeEmailCommercialPort(client);
  ports.whatsappMessagesCommercial = createWhatsAppMessagesCommercialPort(client);
  ports.channelCommercialEntitlement = createChannelCommercialEntitlementPort(client);
  ports.conversationAttachmentUrl = createSupabaseConversationAttachmentUrlPort(client);

  const whatsAppCredentialsLoader = createSupabaseWhatsAppCredentialsLoader(client, {
    onDiagnostic: (detail) =>
      logger.info({ ...detail, event: "whatsapp.credentials" }, "WhatsApp credentials load"),
  });
  const whatsAppCredentialLifecycle = createSupabaseWhatsAppCredentialLifecycle(client);

  const instagramCredentialsLoader = createSupabaseInstagramCredentialsLoader(client);

  const messengerCredentialsLoader = createSupabaseMessengerCredentialsLoader(client);

  const emailCredentialsLoader = createSupabaseEmailCredentialsLoader(client);
  const emailThreadLookup = createSupabaseEmailThreadLookup(client);

  const channelPlatform = createServerChannelPlatformServices(client, {
    ports,
    workflowResolver,
    emailRoutingClassifier: createLlmEmailRoutingClassifier(provider.gateway),
    emailRoutingEngine: createEmailRoutingEngine({
      targetResolver: createSupabaseEmailRoutingTargetResolver(client),
    }),
    campaignDeliveryReconciler: createCampaignDeliveryReconcilePort(client),
    whatsAppCredentialsLoader,
    whatsAppCredentialLifecycle,
    whatsAppOutboundDiagnostic: (detail) => logger.info({ ...detail, event: "whatsapp.outbound" }, "WhatsApp outbound diagnostic"),
    whatsAppDirectOutboundBypass: isWhatsAppDirectOutboundBypassAllowed()
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
    emailCredentialsLoader,
    emailOutboundDiagnostic: (detail) =>
      logger.info({ ...detail, event: "email.outbound" }, "Email outbound diagnostic"),
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

  const emailHandler = createEmailWebhookHandler({
    services: channelPlatform,
    ports,
    resolveSystemContext: () => SYSTEM_CONTEXT,
    resolveCompanyChannel: (companyChannelId) => resolveEmailCompanyChannel(ports, companyChannelId),
    resolveRuntimeConfig: async (companyId) => resolveRuntimeConfig(tenantRuntimeConfig, companyId),
    threadLookup: emailThreadLookup,
  });

  const emailPollingWorker = createEmailPollingWorker({
    client,
    services: channelPlatform,
    ports,
    resolveSystemContext: () => SYSTEM_CONTEXT,
    resolveRuntimeConfig: async (companyId) => resolveRuntimeConfig(tenantRuntimeConfig, companyId),
    threadLookup: emailThreadLookup,
    imapClient: createEmailImapClient({
      fetchImpl: async (input) => fetchImapRuntimeMessages(input),
    }),
    onDiagnostic: (detail) => logger.info({ ...detail, event: "email.poll" }, "Email polling diagnostic"),
  });

  cachedPlatform = {
    client,
    channelPlatform,
    ports,
    whatsAppHandler,
    instagramHandler,
    messengerHandler,
    emailHandler,
    emailPollingWorker,
    resolveRuntimeConfig: (companyId) => resolveRuntimeConfig(tenantRuntimeConfig, companyId),
  };

  return cachedPlatform;
}

async function resolveRuntimeConfig(
  tenantRuntimeConfig: ReturnType<typeof createTenantRuntimeConfigService>,
  companyId: string,
): Promise<TenantRuntimeConfig | null> {
  return waRequestGetOrLoad(WA_REQUEST_CACHE_NS.tenantRuntimeConfig, companyId, async () => {
    if (process.env.WEBHOOK_EXECUTE_AI === "false") {
      return null;
    }

    const config = await tenantRuntimeConfig.ensureReady(companyId);
    if (!config.ready) {
      return null;
    }

    return config;
  });
}

export { SYSTEM_CONTEXT, createChannelRegistryPort, createChannelConversationPort, createChannelRuntimePort };
