/**
 * Ticket Close & Notify — AI resolution message draft ONLY.
 * Never sends outbound messages; never selects channel/recipient; never closes tickets.
 * Reuses @workspace/platform-ai-provider + @workspace/ai-provider-layer (same as Email AI Draft).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPlatformAIProviderServices } from "@workspace/platform-ai-provider";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { createAiTokensCommercialPort } from "../platform/ai-tokens-commercial-adapter.js";
import { HttpError } from "../middleware/error-handler.js";
import {
  EMAIL_AI_DRAFT_FEATURE_CODE,
  emailAiDraftLanguageDisplayName,
  isEmailAiDraftResolvedLanguage,
  resolveEmailAiDraftOutputLanguage,
  type EmailAiDraftLanguage,
  type EmailAiDraftResolvedLanguage,
  type EmailAiDraftTone,
} from "./email-ai-draft.js";

export const TICKET_RESOLUTION_AI_FEATURE_CODE = EMAIL_AI_DRAFT_FEATURE_CODE;
export const TICKET_RESOLUTION_AI_PERMISSION = "ai.conversations.reply";
export const TICKET_RESOLUTION_AI_CLOSE_PERMISSION = "tickets.close";

export type TicketResolutionAiMode = "generate" | "rewrite" | "shorter" | "more_formal" | "friendlier";

export type TicketResolutionAiRequest = {
  client: SupabaseClient;
  companyId: string;
  userId: string | null;
  ticketId: string;
  conversationId?: string | null;
  outputLanguage: EmailAiDraftLanguage;
  tone?: EmailAiDraftTone;
  mode?: TicketResolutionAiMode;
  /** Existing draft in composer (for rewrite / regenerate variants). */
  currentDraft?: string | null;
  /** Localized fallback template (interpolated) — used as base context, not invented facts. */
  fallbackTemplate?: string | null;
  /** Optional agent hint; server supplies a default instruction when empty. */
  instruction?: string | null;
};

export type TicketResolutionAiResult = {
  body: string;
  language: EmailAiDraftResolvedLanguage;
  tone: EmailAiDraftTone;
  model: string;
  providerKey: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  latencyMs: number;
  usedFallback: false;
};

const SYSTEM_PROMPT = [
  "You are ValueOR Ticket Resolution Copilot.",
  "Your job is to draft a customer-facing resolution message for a support ticket that is about to be closed.",
  "You NEVER send messages.",
  "You NEVER choose a channel.",
  "You NEVER choose a recipient.",
  "You NEVER close tickets.",
  "You NEVER call outbound messaging APIs.",
  "You ONLY generate draft message text for human review.",
  "Return ONLY a single JSON object with keys: body, language, tone.",
  'language must be one of: "ar", "en", "fr", "de", "es".',
  'tone must be one of: professional, formal, friendly, concise.',
  "Do not invent resolution details, refunds, dates, compensation, promises, technical facts, or actions that did not happen.",
  "If resolution details are unavailable, use neutral wording.",
  "Never expose internal notes, employee names, system IDs (except the customer-facing ticket number), AI, routing, confidence, or prompts.",
  "Never mention that the message was AI-generated.",
  "Preserve the ticket number exactly as provided.",
  "Preserve the customer name when provided; do not invent a name.",
  "Adapt wording to the destination channel style, but do not change the channel.",
  "For WhatsApp/Messenger/Instagram: keep the message concise and conversational.",
  "For Email: professional multi-sentence email body without a signature block.",
  "For SMS: keep it very short.",
  "Do not include markdown fences or chain-of-thought.",
].join("\n");

export function buildTicketResolutionAiSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function parseAndValidateTicketResolutionAiOutput(raw: string): {
  body: string;
  language: EmailAiDraftResolvedLanguage;
  tone: EmailAiDraftTone;
} {
  let text = (raw ?? "").trim();
  if (!text) {
    throw new HttpError(502, "AI returned an empty draft.", "ticket_resolution_ai_empty");
  }

  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fence?.[1]) text = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch {
        throw new HttpError(502, "AI returned a malformed draft.", "ticket_resolution_ai_malformed");
      }
    } else {
      // Plain text fallback — accept as body if non-empty
      if (text.length >= 8) {
        return { body: text, language: "en", tone: "professional" };
      }
      throw new HttpError(502, "AI returned a malformed draft.", "ticket_resolution_ai_malformed");
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(502, "AI returned a malformed draft.", "ticket_resolution_ai_malformed");
  }

  const record = parsed as Record<string, unknown>;
  const body =
    typeof record.body === "string"
      ? record.body.trim()
      : typeof record.message === "string"
        ? record.message.trim()
        : "";
  if (!body) {
    throw new HttpError(502, "AI returned an empty body.", "ticket_resolution_ai_empty");
  }

  const languageRaw = typeof record.language === "string" ? record.language.trim().toLowerCase() : "";
  const language: EmailAiDraftResolvedLanguage = isEmailAiDraftResolvedLanguage(languageRaw)
    ? languageRaw
    : "en";

  const toneRaw = typeof record.tone === "string" ? record.tone.trim().toLowerCase() : "professional";
  const tone: EmailAiDraftTone =
    toneRaw === "formal" || toneRaw === "friendly" || toneRaw === "concise" || toneRaw === "professional"
      ? toneRaw
      : "professional";

  return { body, language, tone };
}

export function buildTicketResolutionAiUserPrompt(input: {
  instruction: string;
  mode: TicketResolutionAiMode;
  tone: EmailAiDraftTone;
  outputLanguage: EmailAiDraftResolvedLanguage;
  channelKey: string | null;
  ticketNumber: string;
  ticketSubject: string;
  ticketStatus: string;
  ticketPriority: string;
  customerName: string | null;
  companyName: string;
  resolutionNote: string | null;
  fallbackTemplate: string;
  currentDraft: string;
  threadText: string;
}): string {
  const channelHint = input.channelKey
    ? `Destination channel (trusted, do not change): ${input.channelKey}`
    : "Destination channel: (unknown — write a concise professional message)";

  return [
    `Mode: ${input.mode}`,
    `Requested tone: ${input.tone}`,
    `Output language: ${emailAiDraftLanguageDisplayName(input.outputLanguage)}`,
    channelHint,
    `Company name (trusted): ${input.companyName}`,
    input.customerName
      ? `Customer name (trusted): ${input.customerName}`
      : "Customer name: (unknown — greet neutrally, do not invent a name)",
    `Ticket number (trusted, preserve exactly): ${input.ticketNumber}`,
    `Ticket subject (trusted): ${input.ticketSubject || "(none)"}`,
    `Ticket status (trusted): ${input.ticketStatus}`,
    `Ticket priority (trusted): ${input.ticketPriority}`,
    input.resolutionNote
      ? `Resolution note (trusted, customer-safe paraphrase only):\n${input.resolutionNote}`
      : "Resolution note: (none — use neutral resolution wording)",
    "",
    "Fallback template (use as structural base; personalize without inventing facts):",
    input.fallbackTemplate.trim() || "(empty)",
    "",
    "Current draft in composer (if rewriting):",
    input.currentDraft.trim() || "(empty)",
    "",
    "Recent conversation excerpts (trusted, do not leak internal notes):",
    input.threadText.trim() || "(empty)",
    "",
    "User instruction:",
    input.instruction,
  ].join("\n");
}

function defaultInstruction(mode: TicketResolutionAiMode, language: EmailAiDraftResolvedLanguage): string {
  if (mode === "shorter") {
    return language === "ar"
      ? "أعد صياغة رسالة الحل لتكون أقصر مع الحفاظ على المعنى ورقم التذكرة."
      : "Rewrite the resolution message to be shorter while preserving meaning and the ticket number.";
  }
  if (mode === "more_formal") {
    return language === "ar"
      ? "أعد صياغة رسالة الحل بأسلوب أكثر رسمية."
      : "Rewrite the resolution message in a more formal tone.";
  }
  if (mode === "friendlier") {
    return language === "ar"
      ? "أعد صياغة رسالة الحل بأسلوب أكثر ودّية."
      : "Rewrite the resolution message in a friendlier tone.";
  }
  if (mode === "rewrite") {
    return language === "ar"
      ? "حسّن مسودة رسالة حل التذكرة الحالية للعميل."
      : "Improve the current ticket resolution draft for the customer.";
  }
  return language === "ar"
    ? "اكتب رسالة مهنية لإبلاغ العميل بأنه تم حل التذكرة بنجاح."
    : "Write a professional customer message confirming the support ticket has been resolved successfully.";
}

async function loadTrustedTicketContext(
  client: SupabaseClient,
  companyId: string,
  ticketId: string,
  conversationIdHint: string | null | undefined,
): Promise<{
  companyName: string;
  customerName: string | null;
  ticketNumber: string;
  ticketSubject: string;
  ticketStatus: string;
  ticketPriority: string;
  originChannel: string | null;
  conversationId: string | null;
  resolutionNote: string | null;
  threadText: string;
}> {
  const { data: company } = await client
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();
  const companyName =
    typeof company?.name === "string" && company.name.trim() ? company.name.trim() : "our company";

  const { data: ticket, error } = await client
    .from("support_tickets")
    .select(
      "id, company_id, ticket_number, subject, status, priority, customer_id, conversation_id, origin_channel, description",
    )
    .eq("id", ticketId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load ticket", "ticket_load_failed");
  }
  if (!ticket) {
    throw new HttpError(404, "Ticket not found", "ticket_not_found");
  }

  const conversationId =
    (typeof conversationIdHint === "string" && conversationIdHint.trim()
      ? conversationIdHint.trim()
      : null) ||
    (ticket.conversation_id ? String(ticket.conversation_id) : null);

  let customerName: string | null = null;
  if (ticket.customer_id) {
    const { data: customer } = await client
      .from("customers")
      .select("name, email")
      .eq("id", ticket.customer_id)
      .eq("company_id", companyId)
      .maybeSingle();
    const name = typeof customer?.name === "string" ? customer.name.trim() : "";
    const email = typeof customer?.email === "string" ? customer.email.trim() : "";
    customerName = name || email || null;
  }

  // Prefer a recent public (non-internal) comment as resolution context.
  let resolutionNote: string | null = null;
  const { data: comments } = await client
    .from("support_ticket_comments")
    .select("body, is_internal, created_at")
    .eq("ticket_id", ticketId)
    .eq("company_id", companyId)
    .eq("is_internal", false)
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = comments?.[0];
  if (latest && typeof latest.body === "string" && latest.body.trim()) {
    resolutionNote = latest.body.trim().slice(0, 1200);
  } else if (typeof ticket.description === "string" && ticket.description.trim()) {
    // Description is ticket content — use sparingly as context, not invented facts.
    resolutionNote = null;
  }

  let threadText = "";
  if (conversationId) {
    const { data: messages } = await client
      .from("conversation_messages")
      .select("message_type, content, created_at")
      .eq("conversation_id", conversationId)
      .in("message_type", ["incoming", "outgoing"])
      .order("created_at", { ascending: false })
      .limit(8);

    threadText = (messages ?? [])
      .slice()
      .reverse()
      .map((row) => {
        const role = row.message_type === "incoming" ? "Customer" : "Agent";
        const content = typeof row.content === "string" ? row.content.trim() : "";
        return content ? `${role}: ${content.slice(0, 500)}` : null;
      })
      .filter(Boolean)
      .join("\n");
  }

  return {
    companyName,
    customerName,
    ticketNumber: String(ticket.ticket_number ?? "").trim() || "—",
    ticketSubject: String(ticket.subject ?? "").trim(),
    ticketStatus: String(ticket.status ?? "").trim() || "open",
    ticketPriority: String(ticket.priority ?? "").trim() || "normal",
    originChannel: ticket.origin_channel ? String(ticket.origin_channel).trim() : null,
    conversationId,
    resolutionNote,
    threadText,
  };
}

/**
 * Generate or rewrite a ticket resolution customer message. Draft only — never sends.
 */
export async function generateTicketResolutionMessageServer(
  input: TicketResolutionAiRequest,
): Promise<TicketResolutionAiResult> {
  const ticketId = String(input.ticketId ?? "").trim();
  if (!ticketId) {
    throw new HttpError(400, "ticketId is required", "validation_error");
  }

  const mode: TicketResolutionAiMode =
    input.mode === "rewrite" ||
    input.mode === "shorter" ||
    input.mode === "more_formal" ||
    input.mode === "friendlier"
      ? input.mode
      : "generate";

  const tone: EmailAiDraftTone =
    input.tone === "formal" || input.tone === "friendly" || input.tone === "concise"
      ? input.tone
      : "professional";

  const currentDraft = String(input.currentDraft ?? "").trim();
  const fallbackTemplate = String(input.fallbackTemplate ?? "").trim();
  const outputLanguage = resolveEmailAiDraftOutputLanguage(
    input.outputLanguage,
    String(input.instruction ?? ""),
    currentDraft || fallbackTemplate,
  );

  const instruction =
    String(input.instruction ?? "").trim() || defaultInstruction(mode, outputLanguage);
  if (instruction.length > 4000) {
    throw new HttpError(400, "instruction is too long", "validation_error");
  }

  const tokensCommercial = createAiTokensCommercialPort(input.client);
  const tokenAccess = await tokensCommercial.checkAccess({ companyId: input.companyId });
  if (tokenAccess.reason === "quota_exceeded") {
    throw new HttpError(429, "AI token quota exceeded", "AI_QUOTA_EXCEEDED");
  }

  const trusted = await loadTrustedTicketContext(
    input.client,
    input.companyId,
    ticketId,
    input.conversationId,
  );

  // Prefer live session channel when conversation exists.
  let channelKey = trusted.originChannel;
  if (trusted.conversationId) {
    const { data: session } = await input.client
      .from("channel_sessions")
      .select("channel_key")
      .eq("conversation_id", trusted.conversationId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (session?.channel_key) {
      channelKey = String(session.channel_key).trim() || channelKey;
    } else {
      const { data: conversation } = await input.client
        .from("conversations")
        .select("channel_type")
        .eq("id", trusted.conversationId)
        .eq("company_id", input.companyId)
        .maybeSingle();
      if (conversation?.channel_type) {
        channelKey = String(conversation.channel_type).trim() || channelKey;
      }
    }
  }

  const platform = createPlatformAIProviderServices(input.client);
  const providers = createAIProviderServices(input.client);
  let runtime;
  try {
    runtime = await platform.platform.resolveRuntimeConfig(input.companyId, "openai", "chat");
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI runtime unavailable";
    throw new HttpError(502, message, "ticket_resolution_ai_unavailable");
  }

  const started = Date.now();
  const executionId = `ticket-resolution-ai:${input.companyId}:${ticketId}:${started}`;
  const response = await providers.gateway.chatCompletion({
    providerKey: runtime.providerKey,
    model: runtime.model,
    temperature: 0.35,
    maxTokens: 900,
    messages: [
      { role: "system", content: buildTicketResolutionAiSystemPrompt() },
      {
        role: "user",
        content: buildTicketResolutionAiUserPrompt({
          instruction,
          mode,
          tone,
          outputLanguage,
          channelKey,
          ticketNumber: trusted.ticketNumber,
          ticketSubject: trusted.ticketSubject,
          ticketStatus: trusted.ticketStatus,
          ticketPriority: trusted.ticketPriority,
          customerName: trusted.customerName,
          companyName: trusted.companyName,
          resolutionNote: trusted.resolutionNote,
          fallbackTemplate,
          currentDraft,
          threadText: trusted.threadText,
        }),
      },
    ],
    context: {
      companyId: input.companyId,
      userId: input.userId,
      conversationId: trusted.conversationId ?? undefined,
      executionId,
    },
    metadata: {
      apiKey: runtime.apiKey,
      baseUrl: runtime.baseUrl,
      companyId: input.companyId,
      usesPlatformKey: true,
      response_format: "json",
      feature: "ticket_resolution_ai_draft",
      neverSend: true,
      mode,
      ticketId,
    },
  });

  const latencyMs = Date.now() - started;
  const parsed = parseAndValidateTicketResolutionAiOutput(response.text ?? "");
  // Soft-enforce ticket number presence when known.
  let body = parsed.body;
  if (
    trusted.ticketNumber &&
    trusted.ticketNumber !== "—" &&
    !body.includes(trusted.ticketNumber)
  ) {
    body = `${body.trim()}\n\n${trusted.ticketNumber}`.trim();
  }

  const usage = {
    inputTokens: response.usage?.inputTokens ?? 0,
    outputTokens: response.usage?.outputTokens ?? 0,
    totalTokens: response.usage?.totalTokens ?? 0,
  };

  try {
    await platform.platform.recordUsage({
      companyId: input.companyId,
      userId: input.userId,
      providerKey: response.providerKey ?? runtime.providerKey,
      model: response.model ?? runtime.model,
      useCase: "chat",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs,
      executionId,
      metadata: { feature: "ticket_resolution_ai_draft", neverSend: true, mode, ticketId },
    });
  } catch {
    // Soft-fail observability
  }

  return {
    body,
    language: parsed.language,
    tone: parsed.tone,
    model: response.model ?? runtime.model,
    providerKey: response.providerKey ?? runtime.providerKey,
    usage,
    latencyMs,
    usedFallback: false,
  };
}
