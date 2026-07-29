/**
 * Force tool-loop exhaustion scenario matching webhook logs (3x knowledge_search).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createPlatformAIProviderServices } from "../lib/platform-ai-provider/src/index.ts";
import { createAIProviderServices } from "../lib/ai-provider-layer/src/index.ts";
import { ToolCallLoopService } from "../lib/ai-execution-engine/src/runtime/tool-call-loop-service.ts";
import { createRuntimeGatewayPort } from "../lib/ai-execution-engine/src/adapters/enterprise-runtime-adapters.ts";
import { createWebhookToolRouterIntegrations } from "../artifacts/api-server/src/platform/create-webhook-tool-router-integrations.ts";
import { createPlatformRuntimeConfigPort } from "../artifacts/api-server/src/platform/platform-runtime-port.ts";
import { resolveCompanyActorUserId } from "../lib/automation-platform/src/crm/supabase/create-supabase-customer-service-port.ts";

const root = "D:/ValueOR/project";
const env = {};
for (const line of readFileSync(`${root}/.env`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CONVERSATION_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
const captured = [];

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const platformServices = createPlatformAIProviderServices(client);
const platformConfig = createPlatformRuntimeConfigPort(async ({ companyId, providerKey, useCase }) => {
  const runtime = await platformServices.platform.resolveRuntimeConfig(companyId, providerKey, useCase);
  return { apiKey: runtime.apiKey, model: runtime.model, baseUrl: runtime.baseUrl };
});

const platformRuntime = await platformConfig.resolve({
  companyId: COMPANY_ID,
  providerKey: "openai",
  useCase: "tool_calling",
});

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const res = await originalFetch(url, init);
  if (String(url).includes("/chat/completions")) {
    const parsed = JSON.parse(await res.clone().text());
    captured.push({
      iteration: captured.length + 1,
      httpStatus: res.status,
      responseBody: parsed,
      finishReason: parsed?.choices?.[0]?.finish_reason ?? null,
      model: parsed?.model ?? null,
      messageContent: parsed?.choices?.[0]?.message?.content ?? null,
      toolCalls: parsed?.choices?.[0]?.message?.tool_calls ?? null,
    });
  }
  return res;
};

const provider = createAIProviderServices(client);
const gateway = createRuntimeGatewayPort(provider.gateway);
const { tools, toolRouterServices } = createWebhookToolRouterIntegrations(client);
const actorUserId = await resolveCompanyActorUserId(client, COMPANY_ID);
const ctx = { userId: actorUserId, companyId: COMPANY_ID, isSuperAdmin: false, hasPermission: () => true };
const llmTools = tools.listLlmTools();

// Exact failing webhook history from terminal 570455.txt line 411
const messages = [
  { role: "system", content: "## System Instructions\n\n## Language\nRespond in English." },
  { role: "user", content: "Hello" },
  { role: "user", content: "Pricing" },
  { role: "user", content: "dr3" },
  { role: "user", content: "Yes" },
  { role: "user", content: "01023169075" },
  { role: "user", content: "01023169075" },
  { role: "user", content: "Hello" },
  { role: "user", content: "Talk to Support" },
  { role: "user", content: "verify-outbound-1784916765163" },
  { role: "user", content: "502 local full trace" },
];

const loop = new ToolCallLoopService({ gateway, tools: toolRouterServices.tools });
const loopResult = await loop.run({
  ctx,
  conversationId: CONVERSATION_ID,
  gatewayRequest: {
    messages,
    providerKey: "openai",
    model: platformRuntime.model,
    context: { companyId: COMPANY_ID, conversationId: CONVERSATION_ID, userId: actorUserId },
    metadata: { ...platformRuntime, apiKey: platformRuntime.apiKey, baseUrl: platformRuntime.baseUrl, model: platformRuntime.model },
    tools: llmTools,
  },
  tools: llmTools,
  allowedToolKeys: tools.allowedToolKeys(),
});

globalThis.fetch = originalFetch;

const report = {
  loopResponseText: loopResult.response.text,
  loopResponseTextLength: loopResult.response.text?.length ?? 0,
  loopResponseFinishReason: loopResult.response.finishReason,
  loopToolCalls: loopResult.response.toolCalls ?? [],
  toolExecutionCount: loopResult.toolExecutions.length,
  toolExecutions: loopResult.toolExecutions,
  providerCalls: captured,
  wouldThrowProviderUnavailable: !loopResult.response.text.trim(),
};

writeFileSync(`${root}/docs/architecture/sprint-ai3-provider-unavailable-trace.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
