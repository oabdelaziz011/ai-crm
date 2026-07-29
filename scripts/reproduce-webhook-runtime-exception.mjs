/**
 * Reproduce AIProviderConfigurationError stack — mirrors deployed webhook (no platformConfig).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  createAIExecutionServices,
  createEnterpriseRuntimeIntegrations,
} from "../lib/ai-execution-engine/src/index.ts";
import { createAIProviderServices } from "../lib/ai-provider-layer/src/index.ts";
import { createPromptOrchestratorServices } from "../lib/ai-prompt-orchestrator/src/index.ts";
import { createWebhookToolRouterIntegrations } from "../artifacts/api-server/src/platform/create-webhook-tool-router-integrations.ts";
import { resolveCompanyActorUserId } from "../lib/automation-platform/src/crm/supabase/create-supabase-customer-service-port.ts";

const root = "D:/ValueOR/project";
const env = {};
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CONVERSATION_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const prompt = createPromptOrchestratorServices(client);
const provider = createAIProviderServices(client);
const { tools } = createWebhookToolRouterIntegrations(client);

const execution = createAIExecutionServices(
  client,
  createEnterpriseRuntimeIntegrations({
    promptRuntime: prompt.runtime,
    gateway: provider.gateway,
    tools,
  }),
);

const actorUserId = await resolveCompanyActorUserId(client, COMPANY_ID);
const ctx = {
  userId: actorUserId,
  companyId: COMPANY_ID,
  isSuperAdmin: false,
  hasPermission: () => true,
};

try {
  await execution.enterpriseRuntime.execute(ctx, {
    companyId: COMPANY_ID,
    conversationId: CONVERSATION_ID,
    currentUserMessage: "I want to book an appointment. Please check availability.",
    toolsEnabled: true,
    correlationId: "502-trace-repro",
  });
} catch (error) {
  console.log("EXCEPTION_TYPE:", error?.constructor?.name);
  console.log("MESSAGE:", error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.log("STACK:\n", error.stack);
  }
}
