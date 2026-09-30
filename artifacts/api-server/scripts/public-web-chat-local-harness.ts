/**
 * LOCAL TEST HARNESS ONLY — serves the real Public Web Chat router (service → RPCs → Channel Platform
 * inbound pipeline) on 127.0.0.1 for cross-package live E2E tests (e.g. the login-app Phase 2.1 inbox E2E).
 * Loads `.env.localstack` exclusively and refuses any non-local Supabase URL. Never deploy.
 * Prints `WEB_CHAT_HARNESS_READY <port>` once listening.
 * Run (from artifacts/api-server): node --import tsx/esm scripts/public-web-chat-local-harness.ts
 */
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/;

const raw = readFileSync(resolve(projectRoot, ".env.localstack"), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (match) env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
}
for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
  if (!LOCAL_URL.test(env[key] ?? "")) throw new Error(`Refusing to run: ${key} is not local`);
}
if (env.DATABASE_URL && !/@(127\.0\.0\.1|localhost):54322\//.test(env.DATABASE_URL)) {
  throw new Error("Refusing to run: DATABASE_URL is not local");
}
Object.assign(process.env, env, {
  NODE_ENV: "development",
  PUBLIC_WEB_CHAT_API_ENABLED: "true",
  WEBHOOK_EXECUTE_AI: "true",
});

const { getWebhookPlatform, SYSTEM_CONTEXT } = await import("../src/platform/create-webhook-platform.js");
const { createWebhookHandoffPlatformServices } = await import("../src/platform/create-webhook-handoff-platform.js");
const { createPublicWebChatInboundPort } = await import("../src/services/public-web-chat/public-web-chat-inbound-port.js");
const { createSupabaseWebChatRateLimitStore } = await import("../src/services/public-web-chat/public-web-chat-rate-limit.js");
const { createSupabasePublicWebChatRepository } = await import("../src/services/public-web-chat/public-web-chat-repository.js");
const { createPublicWebChatService } = await import("../src/services/public-web-chat/public-web-chat-service.js");
const { createPublicWebChatRouter } = await import("../src/routes/public-web-chat-router.js");
const { PUBLIC_WEB_CHAT_ROUTE_PREFIX } = await import("../src/services/public-web-chat/public-web-chat-config.js");
const {
  getSandboxE2EInvocations,
  resetSandboxE2EInvocations,
  setSandboxE2EForcedFailures,
} = await import("@workspace/ai-provider-layer");
const { clearEmployeeChannelRuntimeCache } = await import(
  "@login-app/lib/ai-employees/services/resolve-employee-channel-runtime.js"
);

resetSandboxE2EInvocations();

const platform = getWebhookPlatform();
const { handoffService } = createWebhookHandoffPlatformServices(platform.client);
const flags = { executeAi: true };
const service = createPublicWebChatService({
  repository: createSupabasePublicWebChatRepository(platform.client),
  inbound: createPublicWebChatInboundPort({
    router: platform.channelPlatform.router,
    systemContext: SYSTEM_CONTEXT,
    automationGate: platform.ports.inboundAutomationGate ?? null,
    handoffService,
  }),
  rateLimit: createSupabaseWebChatRateLimitStore(platform.client, { keyPrefix: `h${process.pid}:` }),
  fingerprintSecret: "local-harness-secret",
  get executeAi() {
    return flags.executeAi;
  },
});

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(PUBLIC_WEB_CHAT_ROUTE_PREFIX, createPublicWebChatRouter({ resolveService: () => service }));
app.post("/__harness/sandbox-llm/reset", (_req, res) => {
  resetSandboxE2EInvocations();
  setSandboxE2EForcedFailures(0);
  res.status(204).end();
});
app.post("/__harness/sandbox-llm/fail", (req, res) => {
  const raw = req.query.count ?? (req.body as { count?: unknown } | undefined)?.count ?? 3;
  const count = Number(raw);
  setSandboxE2EForcedFailures(Number.isFinite(count) ? count : 3);
  res.status(204).end();
});
app.post("/__harness/execute-ai", (req, res) => {
  const raw = String(req.query.enabled ?? (req.body as { enabled?: unknown } | undefined)?.enabled ?? "true");
  flags.executeAi = raw !== "false";
  res.json({ executeAi: flags.executeAi });
});
app.post("/__harness/clear-runtime-cache", (_req, res) => {
  clearEmployeeChannelRuntimeCache();
  res.status(204).end();
});
const openaiCompat = { failNext: 0, hits: [] as Array<{ model: string; messageCount: number }> };
app.post("/__openai/v1/chat/completions", (req, res) => {
  const body = (req.body ?? {}) as { model?: string; messages?: Array<{ role?: string; content?: unknown }> };
  openaiCompat.hits.push({
    model: typeof body.model === "string" ? body.model : "unknown",
    messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
  });
  if (openaiCompat.failNext > 0) {
    openaiCompat.failNext -= 1;
    res.status(500).json({ error: { message: "openai_compat_forced_failure", type: "server_error" } });
    return;
  }
  const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
  const text = typeof lastUser?.content === "string" ? lastUser.content.slice(0, 180) : "";
  res.json({
    id: "chatcmpl-local-webchat",
    object: "chat.completion",
    model: body.model ?? "gpt-4o-mini",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: `I can help with that. ${text ? `You mentioned: ${text}` : "How can I assist?"}`.slice(0, 500),
        },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 24, completion_tokens: 32, total_tokens: 56 },
  });
});
app.post("/__harness/openai-compat/reset", (_req, res) => {
  openaiCompat.hits = [];
  openaiCompat.failNext = 0;
  res.status(204).end();
});
app.post("/__harness/openai-compat/fail", (req, res) => {
  const raw = req.query.count ?? (req.body as { count?: unknown } | undefined)?.count ?? 5;
  const count = Number(raw);
  openaiCompat.failNext = Number.isFinite(count) ? count : 5;
  res.status(204).end();
});
app.get("/__harness/openai-compat", (_req, res) => {
  res.json({ hits: openaiCompat.hits });
});
app.post("/__harness/handoff/:companyId/:conversationId", async (req, res) => {
  try {
    await handoffService.requestCustomerHandoff({
      companyId: req.params.companyId,
      conversationId: req.params.conversationId,
      triggerCode: "customer_requested",
      reason: "local harness: visitor asked for a human",
    });
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const server = app.listen(0, "127.0.0.1", () => {
  const line = `WEB_CHAT_HARNESS_READY ${(server.address() as AddressInfo).port}\n`;
  process.stdout.write(line);
  process.stderr.write(line);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
