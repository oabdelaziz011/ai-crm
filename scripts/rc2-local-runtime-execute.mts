/**
 * RC-2: Simulate webhook runtime coordinator path (no login-app imports).
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  resolveArgOrEnv,
} from "./lib/dev-script-env.mjs";
import { createConversationServices } from "../lib/ai-conversation/src/index.ts";
import { createIntentEngineServices } from "../lib/ai-intent-engine/src/index.ts";
import { createEmbeddingPlatformServices } from "../lib/embedding-platform/src/index.ts";
import { createVectorQueryServices } from "../lib/vector-query/src/index.ts";
import { createRetrievalServices, createRetrievalPlatformPorts } from "../lib/retrieval-engine/src/index.ts";
import { createPromptOrchestratorServices } from "../lib/ai-prompt-orchestrator/src/index.ts";
import { createAIProviderServices } from "../lib/ai-provider-layer/src/index.ts";
import { createAIExecutionServices, createEnterpriseRuntimeIntegrations } from "../lib/ai-execution-engine/src/index.ts";
import { createRuntimeIntegrationServices, NoopRuntimeTelemetryPort } from "../lib/runtime-integration/src/index.ts";
import { createRuntimeEnginePortsWithContext } from "../lib/runtime-integration/src/factory/runtime-engine-ports.ts";
import { createKnowledgeRuntimeProvider } from "../lib/knowledge-runtime/src/index.ts";
import { createCustomer360Loader, createSupabaseCustomer360DataPort } from "../lib/customer-360/src/index.ts";
import { createTicketPlatformServices } from "../lib/ticket-platform/src/index.ts";
import { createPlatformAIProviderServices } from "../lib/platform-ai-provider/src/index.ts";
import { createPlatformRuntimeConfigPort } from "../artifacts/api-server/src/platform/platform-runtime-port.ts";
import { createWebhookToolRouterIntegrations } from "../artifacts/api-server/src/platform/create-webhook-tool-router-integrations.ts";
import { resolveCompanyActorUserId } from "../lib/automation-platform/src/crm/supabase/create-supabase-customer-service-port.ts";
import { createTenantRuntimeConfigService } from "../lib/tenant-ai-bootstrap/src/services/tenant-runtime-config-service.ts";

const { root, env } = loadDevScriptEnv(import.meta.url);
const argv = process.argv.slice(2);
const COMPANY_ID = resolveArgOrEnv(argv, 0, ["COMPANY_ID", "VERIFY_COMPANY_ID"], env, "company id");
const CONVERSATION_ID = resolveArgOrEnv(argv, 1, ["CONVERSATION_ID"], env, "conversation id");

const client = createServiceRoleSupabaseClient(env, createClient);

const SYSTEM_CONTEXT = {
  userId: null,
  companyId: null,
  isSuperAdmin: true,
  hasPermission: () => true,
};

const conversation = createConversationServices(client);
const intent = createIntentEngineServices(client);
const embedding = createEmbeddingPlatformServices(client);
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

const knowledgeRuntimeProvider = createKnowledgeRuntimeProvider(retrieval.knowledge);
const runtimePorts = createRuntimeEnginePortsWithContext(
  { conversation, intent, vectorQuery, retrieval, prompt, execution, provider },
  SYSTEM_CONTEXT,
  {
    customer360Loader: createCustomer360Loader(
      createSupabaseCustomer360DataPort(client, {
        resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
        ticketReads: createTicketPlatformServices(client).reads,
      }),
    ),
    knowledgeRuntimeProvider,
    resolveActorUserId: (companyId) => resolveCompanyActorUserId(client, companyId),
    promptMode: "webhook",
  },
);

const runtime = createRuntimeIntegrationServices(client, {
  ports: runtimePorts,
  telemetry: new NoopRuntimeTelemetryPort(),
});

const tenantRuntimeConfig = createTenantRuntimeConfigService(client);
const config = await tenantRuntimeConfig.ensureReady(COMPANY_ID);

const actorUserId = await resolveCompanyActorUserId(client, COMPANY_ID);
const runtimeCtx = {
  ...SYSTEM_CONTEXT,
  companyId: COMPANY_ID,
  userId: actorUserId,
};

let result;
let errorInfo = null;
try {
  result = await runtime.coordinator.execute(runtimeCtx, {
    companyId: COMPANY_ID,
    conversationId: CONVERSATION_ID,
    messageText: "RC-2 local runtime probe — what are your prices?",
    providerConnectionId: config.providerConnectionId!,
    knowledgeRetrieval: config.knowledgeRetrieval ?? undefined,
    executionPolicy: { streaming: false },
    correlationId: `rc2-probe-${Date.now()}`,
  });
} catch (error) {
  errorInfo = {
    name: error?.name ?? null,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.split("\n").slice(0, 12) : null,
  };
}

const report = {
  probedAt: new Date().toISOString(),
  configReady: config.ready,
  providerConnectionId: config.providerConnectionId,
  knowledgeRetrieval: config.knowledgeRetrieval,
  actorUserId,
  success: !errorInfo,
  error: errorInfo,
  executionId: result?.executionId ?? null,
  responsePreview: result?.responseContent?.slice(0, 200) ?? null,
};

writeFileSync(resolve(root, "docs/architecture/rc2-local-runtime-execute.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
