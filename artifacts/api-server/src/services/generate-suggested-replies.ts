import type { SupabaseClient } from "@supabase/supabase-js";
import { createPlatformAIProviderServices } from "@workspace/platform-ai-provider";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { createAiTokensCommercialPort } from "../platform/ai-tokens-commercial-adapter.js";
import { HttpError } from "../middleware/error-handler.js";
import {
  buildSuggestedRepliesSystemPrompt,
  buildSuggestedRepliesUserPrompt,
  detectSuggestedReplyLanguage,
  parseAndValidateSuggestedReplyOutput,
  SUGGESTED_REPLY_MESSAGE_WINDOW,
  type SuggestedReplyGenerationContext,
  type SuggestedReplyLlmMessage,
} from "./suggested-replies-llm.js";

export type GenerateSuggestedRepliesInput = {
  client: SupabaseClient;
  companyId: string;
  conversationId: string;
  userId: string | null;
  /** Optional client hints — never trusted for tenant identity. */
  hintTone?: string | null;
  hintIntent?: string | null;
  hintTargetLanguage?: "ar" | "en" | null;
  refreshSeed?: number | null;
};

export type GenerateSuggestedRepliesResult = {
  suggestions: string[];
  targetLanguage: "ar" | "en";
  source: "llm";
  model: string;
  providerKey: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  latencyMs: number;
};

function readOverlayLanguage(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  for (const key of ["language", "locale", "detectedLanguage", "preferredLanguage"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const lifecycle = metadata.lifecycle;
  if (lifecycle && typeof lifecycle === "object" && !Array.isArray(lifecycle)) {
    const lang = (lifecycle as Record<string, unknown>).language;
    if (typeof lang === "string" && lang.trim()) return lang.trim();
  }
  return null;
}

function readOverlaySummary(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  for (const key of ["summary", "conversationSummary", "aiSummary"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 400);
  }
  return null;
}

function mapMessageRole(messageType: string): SuggestedReplyLlmMessage["role"] {
  if (messageType === "incoming") return "customer";
  if (messageType === "internal_note") return "system_note";
  return "agent";
}

async function loadTrustedContext(
  client: SupabaseClient,
  companyId: string,
  conversationId: string,
): Promise<{
  channelType: string | null;
  metadataLanguage: string | null;
  summary: string | null;
  customerId: string | null;
  recentMessages: SuggestedReplyLlmMessage[];
  latestCustomerMessage: string;
  ticket: SuggestedReplyGenerationContext["ticket"];
  booking: SuggestedReplyGenerationContext["booking"];
}> {
  const { data: conversation, error: conversationError } = await client
    .from("conversations")
    .select("id, company_id, channel_type, metadata, customer_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (conversationError) {
    throw new HttpError(500, "Failed to load conversation", "conversation_load_failed");
  }
  if (!conversation || String(conversation.company_id) !== companyId) {
    throw new HttpError(404, "Conversation not found", "conversation_not_found");
  }

  const metadata =
    conversation.metadata && typeof conversation.metadata === "object"
      ? (conversation.metadata as Record<string, unknown>)
      : null;

  const { data: messageRows, error: messagesError } = await client
    .from("conversation_messages")
    .select("message_type, content, created_at, sequence_number")
    .eq("conversation_id", conversationId)
    .order("sequence_number", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(SUGGESTED_REPLY_MESSAGE_WINDOW);

  if (messagesError) {
    throw new HttpError(500, "Failed to load messages", "messages_load_failed");
  }

  const chronological = [...(messageRows ?? [])].reverse();
  const recentMessages: SuggestedReplyLlmMessage[] = chronological
    .map((row) => {
      const text = typeof row.content === "string" ? row.content.trim() : "";
      if (!text) return null;
      // Never include secrets-looking blobs
      if (/sk-[a-z0-9]{10,}/i.test(text)) return null;
      return {
        role: mapMessageRole(String(row.message_type ?? "")),
        text: text.slice(0, 500),
      } satisfies SuggestedReplyLlmMessage;
    })
    .filter((row): row is SuggestedReplyLlmMessage => Boolean(row));

  const latestCustomerMessage =
    [...recentMessages].reverse().find((message) => message.role === "customer")?.text ?? "";

  const { data: ticketRows, error: ticketError } = await client
    .from("support_tickets")
    .select("ticket_number, status, priority, subject, company_id, conversation_id")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .in("status", ["open", "in_progress", "waiting_customer"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (ticketError) {
    throw new HttpError(500, "Failed to load ticket context", "ticket_load_failed");
  }

  const ticketRow = ticketRows?.[0];
  const ticket =
    ticketRow && String(ticketRow.company_id) === companyId
      ? {
          ticketNumber: String(ticketRow.ticket_number ?? ""),
          status: String(ticketRow.status ?? ""),
          priority: String(ticketRow.priority ?? ""),
          subject: String(ticketRow.subject ?? "").slice(0, 160),
        }
      : null;

  // Trusted booking only when linked to this conversation under the same company.
  // Soft-fail: missing table/column must not break suggested replies.
  let booking: SuggestedReplyGenerationContext["booking"] = null;
  const { data: bookingRows, error: bookingError } = await client
    .from("scheduling_bookings")
    .select("status, start_at, confirmation_number, company_id, conversation_id")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .order("start_at", { ascending: false })
    .limit(1);

  if (!bookingError) {
    const bookingRow = bookingRows?.[0];
    if (bookingRow && String(bookingRow.company_id) === companyId) {
      booking = {
        status: String(bookingRow.status ?? ""),
        startAt: bookingRow.start_at ? String(bookingRow.start_at) : null,
        confirmationNumber: bookingRow.confirmation_number
          ? String(bookingRow.confirmation_number).slice(0, 64)
          : null,
      };
    }
  }

  return {
    channelType: typeof conversation.channel_type === "string" ? conversation.channel_type : null,
    metadataLanguage: readOverlayLanguage(metadata),
    summary: readOverlaySummary(metadata),
    customerId: conversation.customer_id ? String(conversation.customer_id) : null,
    recentMessages,
    latestCustomerMessage,
    ticket,
    booking,
  };
}

export async function generateSuggestedRepliesWithLlm(
  input: GenerateSuggestedRepliesInput,
): Promise<GenerateSuggestedRepliesResult> {
  const companyId = input.companyId.trim();
  const conversationId = input.conversationId.trim();
  if (!companyId || !conversationId) {
    throw new HttpError(400, "companyId and conversationId are required", "validation_error");
  }

  const commercial = createAiTokensCommercialPort(input.client);
  const executionId = `suggested-replies:${conversationId}:${Date.now()}:${input.refreshSeed ?? 0}`;
  const access = await commercial.checkAccess({ companyId });
  // Shared AI token quota applies when configured. Feature entitlement is gated separately
  // via ai_suggested_replies. If ai_assistant is not entitled, still allow (feature has its own gate).
  if (access.reason === "quota_exceeded") {
    throw new HttpError(429, "AI token quota exceeded", "AI_QUOTA_EXCEEDED");
  }

  const trusted = await loadTrustedContext(input.client, companyId, conversationId);
  // Language priority: trusted metadata → latest customer message → client hint → en
  const targetLanguage = detectSuggestedReplyLanguage({
    metadataLanguage: trusted.metadataLanguage,
    latestCustomerMessage: trusted.latestCustomerMessage,
    fallback:
      input.hintTargetLanguage === "ar" || input.hintTargetLanguage === "en"
        ? input.hintTargetLanguage
        : "en",
  });

  const context: SuggestedReplyGenerationContext = {
    targetLanguage,
    tone: (input.hintTone?.trim() || "neutral").slice(0, 40),
    intent: (input.hintIntent?.trim() || "general").slice(0, 80),
    summary: trusted.summary,
    channelType: trusted.channelType,
    latestCustomerMessage: trusted.latestCustomerMessage,
    recentMessages: trusted.recentMessages,
    ticket: trusted.ticket,
    booking: trusted.booking,
  };

  const platform = createPlatformAIProviderServices(input.client);
  const providers = createAIProviderServices(input.client);
  const runtime = await platform.platform.resolveRuntimeConfig(companyId, "openai", "chat");

  const response = await providers.gateway.chatCompletion({
    providerKey: runtime.providerKey,
    model: runtime.model,
    temperature: 0.7,
    maxTokens: 500,
    messages: [
      { role: "system", content: buildSuggestedRepliesSystemPrompt() },
      { role: "user", content: buildSuggestedRepliesUserPrompt(context) },
    ],
    context: {
      companyId,
      userId: input.userId,
      conversationId,
      executionId,
    },
    metadata: {
      apiKey: runtime.apiKey,
      baseUrl: runtime.baseUrl,
      companyId,
      usesPlatformKey: true,
      response_format: "json",
    },
  });

  const suggestions = parseAndValidateSuggestedReplyOutput(response.text ?? "");

  try {
    await platform.platform.recordUsage({
      companyId,
      userId: input.userId,
      providerKey: response.providerKey,
      model: response.model,
      useCase: "chat",
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
      estimatedCostUsd: response.estimatedCostUsd ?? null,
      latencyMs: response.latencyMs ?? null,
      status: "succeeded",
      conversationId,
      executionId,
    });
  } catch {
    // Non-fatal — suggestions already validated
  }

  const totalTokens = Number(response.usage?.totalTokens ?? 0);
  if (totalTokens > 0 && access.allowed) {
    try {
      await commercial.recordUsage({
        companyId,
        executionId,
        quantity: totalTokens,
      });
    } catch {
      // Non-fatal
    }
  }

  return {
    suggestions,
    targetLanguage,
    source: "llm",
    model: response.model,
    providerKey: response.providerKey,
    usage: {
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
      totalTokens: response.usage?.totalTokens ?? 0,
    },
    latencyMs: response.latencyMs ?? 0,
  };
}
