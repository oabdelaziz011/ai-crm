import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { createPlatformAIProviderServices } from "@workspace/platform-ai-provider";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";

/**
 * Browser-safe Platform AI proxy.
 * Resolves/decrypts provider credentials with service_role and calls the provider
 * server-side. Never returns apiKey / secrets to the client.
 */
const router: IRouter = Router();

router.use(providerOpsRateLimiter);
router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new HttpError(503, "Supabase service credentials missing", "auth_unavailable");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

router.post("/chat-completion", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    // Never trust browser companyId alone — requireCompanyScope already enforced
    // profile company match (or super-admin). Prefer session company when present.
    const effectiveCompanyId =
      req.supabaseIsSuperAdmin && companyId
        ? companyId
        : (req.supabaseCompanyId ?? companyId);

    if (!effectiveCompanyId) {
      throw new HttpError(400, "companyId required", "validation_error");
    }

    const providerKey = readString(req.body?.providerKey, "openai");
    const useCase = readString(req.body?.useCase, "chat") as "chat" | "tool_calling" | "embeddings";
    const model = readString(req.body?.model) || undefined;
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
    if (!messages || messages.length === 0) {
      throw new HttpError(400, "messages required", "validation_error");
    }

    const client = getServiceClient();
    const platform = createPlatformAIProviderServices(client);
    const providers = createAIProviderServices(client);

    const runtime = await platform.platform.resolveRuntimeConfig(
      effectiveCompanyId,
      providerKey,
      useCase === "embeddings" ? "chat" : useCase,
    );

    const response = await providers.gateway.chatCompletion({
      providerKey: runtime.providerKey,
      model: model ?? runtime.model,
      temperature: typeof req.body?.temperature === "number" ? req.body.temperature : undefined,
      maxTokens: typeof req.body?.maxTokens === "number" ? req.body.maxTokens : undefined,
      topP: typeof req.body?.topP === "number" ? req.body.topP : undefined,
      messages,
      tools: Array.isArray(req.body?.tools) ? req.body.tools : undefined,
      context: {
        companyId: effectiveCompanyId,
        userId: req.supabaseUser?.id ?? null,
        conversationId:
          typeof req.body?.conversationId === "string" ? req.body.conversationId : undefined,
        executionId: typeof req.body?.executionId === "string" ? req.body.executionId : undefined,
      },
      metadata: {
        apiKey: runtime.apiKey,
        baseUrl: runtime.baseUrl,
        companyId: effectiveCompanyId,
        usesPlatformKey: true,
        response_format: req.body?.responseFormat === "json" ? "json" : undefined,
      },
    });

    // Safe response — no credentials
    res.json({
      text: response.text,
      model: response.model,
      providerKey: response.providerKey,
      finishReason: response.finishReason,
      usage: response.usage,
      latencyMs: response.latencyMs,
      estimatedCostUsd: response.estimatedCostUsd,
      toolCalls: response.toolCalls,
      assistantMessage: response.assistantMessage,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/embeddings", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const effectiveCompanyId =
      req.supabaseIsSuperAdmin && companyId
        ? companyId
        : (req.supabaseCompanyId ?? companyId);

    if (!effectiveCompanyId) {
      throw new HttpError(400, "companyId required", "validation_error");
    }

    const providerKey = readString(req.body?.providerKey, "openai");
    const model = readString(req.body?.model) || undefined;
    const input = req.body?.input;
    const text =
      typeof input === "string"
        ? input
        : Array.isArray(input)
          ? input.map(String).join("\n")
          : "";
    if (!text.trim()) {
      throw new HttpError(400, "input required", "validation_error");
    }

    const client = getServiceClient();
    const platform = createPlatformAIProviderServices(client);
    const providers = createAIProviderServices(client);

    const runtime = await platform.platform.resolveRuntimeConfig(
      effectiveCompanyId,
      providerKey,
      "embeddings",
    );

    const response = await providers.gateway.createEmbeddings({
      providerKey: runtime.providerKey,
      model: model ?? runtime.model,
      input: text,
      context: {
        companyId: effectiveCompanyId,
        userId: req.supabaseUser?.id ?? null,
      },
      metadata: {
        apiKey: runtime.apiKey,
        baseUrl: runtime.baseUrl,
        companyId: effectiveCompanyId,
        usesPlatformKey: true,
      },
    });

    res.json({
      vectors: response.vectors,
      vector: response.vectors[0] ?? null,
      dimensions: response.dimensions,
      model: response.model,
      providerKey: response.providerKey,
      usage: response.usage,
      latencyMs: response.latencyMs,
      estimatedCostUsd: response.estimatedCostUsd,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
