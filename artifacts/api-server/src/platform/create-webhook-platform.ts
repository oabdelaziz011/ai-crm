import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createConversationServices } from "@workspace/ai-conversation";
import { createAIExecutionServices } from "@workspace/ai-execution-engine";
import { createIntentEngineServices } from "@workspace/ai-intent-engine";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { createPromptOrchestratorServices } from "@workspace/ai-prompt-orchestrator";
import { createChannelRegistryServices } from "@workspace/channel-registry";
import {
  createChannelPlatformServices,
  createWhatsAppWebhookHandler,
  resolveWhatsAppCompanyChannel,
  type ChannelPlatformPorts,
  type ChannelPlatformServices,
} from "@workspace/channel-platform";
import { createRetrievalServices } from "@workspace/retrieval-engine";
import { createRuntimeIntegrationServices, NoopRuntimeTelemetryPort } from "@workspace/runtime-integration";
import { createVectorQueryServices } from "@workspace/vector-query";
import {
  createChannelPlatformPortsWithContext,
  createChannelRegistryPort,
  createChannelConversationPort,
  createChannelRuntimePort,
} from "./channel-platform-ports.js";
import { createRuntimeEnginePortsWithContext } from "./runtime-engine-ports.js";

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
  resolveRuntimeConfig: (companyId: string) => Promise<{
    providerConnectionId: string;
    aiAssistantId: string;
  } | null>;
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
  const vectorQuery = createVectorQueryServices(client);
  const retrieval = createRetrievalServices(client);
  const prompt = createPromptOrchestratorServices(client);
  const execution = createAIExecutionServices(client);
  const provider = createAIProviderServices(client);

  const runtimePorts = createRuntimeEnginePortsWithContext(
    { conversation, intent, vectorQuery, retrieval, prompt, execution, provider },
    SYSTEM_CONTEXT,
  );

  const runtime = createRuntimeIntegrationServices(client, {
    ports: runtimePorts,
    telemetry: new NoopRuntimeTelemetryPort(),
  });

  const ports = createChannelPlatformPortsWithContext(
    { channelRegistry, conversation, runtime },
    {
      registry: SYSTEM_CONTEXT,
      conversation: SYSTEM_CONTEXT,
      runtime: SYSTEM_CONTEXT,
    },
  );

  const channelPlatform = createChannelPlatformServices(client, { ports });

  const whatsAppHandler = createWhatsAppWebhookHandler({
    client,
    services: channelPlatform,
    ports,
    resolveSystemContext: () => SYSTEM_CONTEXT,
    resolveCompanyChannel: (companyChannelId) =>
      resolveWhatsAppCompanyChannel(ports, companyChannelId),
    resolveRuntimeConfig: async (companyId) => resolveRuntimeConfig(client, companyId),
  });

  cachedPlatform = {
    client,
    channelPlatform,
    ports,
    whatsAppHandler,
    resolveRuntimeConfig: (companyId) => resolveRuntimeConfig(client, companyId),
  };

  return cachedPlatform;
}

async function resolveRuntimeConfig(client: SupabaseClient, companyId: string) {
  if (process.env.WEBHOOK_EXECUTE_AI === "false") {
    return null;
  }

  const { data: assistant } = await client
    .from("ai_assistant_settings")
    .select("id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  const { data: providerConnection } = await client
    .from("ai_provider_connections")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_enabled", true)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assistant?.id || !providerConnection?.id) {
    return null;
  }

  return {
    aiAssistantId: assistant.id,
    providerConnectionId: providerConnection.id,
  };
}

export { SYSTEM_CONTEXT, createChannelRegistryPort, createChannelConversationPort, createChannelRuntimePort };
