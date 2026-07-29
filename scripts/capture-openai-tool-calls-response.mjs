import { readFileSync } from "node:fs";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createPlatformAIProviderServices } from "../lib/platform-ai-provider/src/index.ts";
import { createPlatformRuntimeConfigPort } from "../artifacts/api-server/src/platform/platform-runtime-port.ts";

const env = {};
for (const line of readFileSync("D:/ValueOR/project/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const platformServices = createPlatformAIProviderServices(client);
const platformConfig = createPlatformRuntimeConfigPort(async ({ companyId, providerKey, useCase }) => {
  const runtime = await platformServices.platform.resolveRuntimeConfig(companyId, providerKey, useCase);
  return { apiKey: runtime.apiKey, model: runtime.model, baseUrl: runtime.baseUrl };
});

const runtime = await platformConfig.resolve({
  companyId: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
  providerKey: "openai",
  useCase: "tool_calling",
});

const body = {
  model: runtime.model,
  messages: [
    { role: "system", content: "## System Instructions\n\n## Language\nRespond in English." },
    { role: "user", content: "Talk to Support" },
    { role: "user", content: "verify-outbound-1784916765163" },
    {
      role: "user",
      content:
        "Use knowledge_search now for verify-outbound-1784916765163 support documentation. Do not answer without calling knowledge_search.",
    },
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "knowledge_search",
        description: "Search knowledge base",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    },
  ],
  tool_choice: "required",
};

const res = await fetch(`${runtime.baseUrl || "https://api.openai.com/v1"}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${runtime.apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const parsed = JSON.parse(await res.text());
console.log(
  JSON.stringify(
    {
      httpStatus: res.status,
      finishReason: parsed?.choices?.[0]?.finish_reason ?? null,
      model: parsed?.model ?? null,
      messageContent: parsed?.choices?.[0]?.message?.content ?? null,
      toolCalls: parsed?.choices?.[0]?.message?.tool_calls ?? null,
      parsedPayload: {
        text: parsed?.choices?.[0]?.message?.content ?? "",
        finishReason: parsed?.choices?.[0]?.finish_reason ?? "stop",
        toolCalls: parsed?.choices?.[0]?.message?.tool_calls,
      },
      responseBody: parsed,
    },
    null,
    2,
  ),
);
