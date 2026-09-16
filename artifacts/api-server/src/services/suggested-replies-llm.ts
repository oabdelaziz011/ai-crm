/**
 * Omnichannel suggested-reply LLM helpers (server + shared validation).
 * Text drafts only — no tools, mutations, or auto-send.
 */

export const SUGGESTED_REPLIES_FEATURE_CODE = "ai_suggested_replies";
export const SUGGESTED_REPLY_MAX_TEXT_LENGTH = 220;
export const SUGGESTED_REPLY_MIN_COUNT = 3;
export const SUGGESTED_REPLY_MAX_COUNT = 5;
export const SUGGESTED_REPLY_MESSAGE_WINDOW = 16;

const PROMPT_LEAK_PATTERNS = [
  /system prompt/i,
  /ignore previous instructions/i,
  /you are generating short draft replies/i,
  /developer message/i,
  /api[_ -]?key/i,
  /sk-[a-z0-9]{10,}/i,
];

export type SuggestedReplyLlmMessage = {
  role: "customer" | "agent" | "system_note";
  text: string;
};

export type SuggestedReplyTrustedTicketContext = {
  ticketNumber: string;
  status: string;
  priority: string;
  subject: string;
};

export type SuggestedReplyTrustedBookingContext = {
  status: string;
  startAt: string | null;
  confirmationNumber: string | null;
};

export type SuggestedReplyGenerationContext = {
  targetLanguage: "ar" | "en";
  tone: string;
  intent: string;
  summary: string | null;
  channelType: string | null;
  latestCustomerMessage: string;
  recentMessages: SuggestedReplyLlmMessage[];
  ticket: SuggestedReplyTrustedTicketContext | null;
  booking: SuggestedReplyTrustedBookingContext | null;
};

export function buildSuggestedRepliesSystemPrompt(): string {
  return [
    "You are generating short draft replies for a customer-service agent.",
    "You are NOT the agent.",
    "You must NOT send messages.",
    "You must NOT execute actions.",
    "You must NOT call tools.",
    "You must NOT invent facts, ticket status, booking details, payments, or SLA deadlines.",
    "Generate 3-5 concise reply options based strictly on the provided conversation context.",
    "Each option must:",
    "- directly address the customer's latest intent",
    "- be natural and professional",
    "- match the customer's language exactly",
    "- be concise (about 5-20 words)",
    "- avoid inventing facts",
    "- avoid promising unsupported actions",
    "- avoid exposing internal information",
    "- avoid mentioning that an AI generated the response",
    "- avoid unnecessary greetings unless appropriate",
    "- avoid repetitive near-duplicates",
    "Return ONLY valid JSON with this shape:",
    '{"suggestions":[{"text":"..."},{"text":"..."},{"text":"..."}]}',
  ].join("\n");
}

export function buildSuggestedRepliesUserPrompt(context: SuggestedReplyGenerationContext): string {
  const transcript = context.recentMessages
    .map((message) => {
      const label =
        message.role === "customer"
          ? "Customer"
          : message.role === "agent"
            ? "Agent"
            : "InternalNote";
      return `${label}: ${message.text}`;
    })
    .join("\n");

  const ticketBlock = context.ticket
    ? [
        "Linked support ticket (trusted):",
        `- number: ${context.ticket.ticketNumber}`,
        `- status: ${context.ticket.status}`,
        `- priority: ${context.ticket.priority}`,
        `- subject: ${context.ticket.subject}`,
      ].join("\n")
    : "Linked support ticket: none";

  const bookingBlock = context.booking
    ? [
        "Linked booking (trusted, customer-visible only):",
        `- status: ${context.booking.status}`,
        context.booking.startAt ? `- start_at: ${context.booking.startAt}` : null,
        context.booking.confirmationNumber
          ? `- confirmation: ${context.booking.confirmationNumber}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "Linked booking: none";

  return [
    `Target language: ${context.targetLanguage === "ar" ? "Arabic" : "English"}`,
    `Tone: ${context.tone}`,
    `Intent: ${context.intent}`,
    `Channel: ${context.channelType ?? "unknown"}`,
    context.summary ? `Conversation summary: ${context.summary}` : "Conversation summary: none",
    ticketBlock,
    bookingBlock,
    "Recent transcript (oldest → newest):",
    transcript || "(no messages)",
    `Latest customer message: ${context.latestCustomerMessage || "—"}`,
    "Return JSON only.",
  ].join("\n\n");
}

function normalizeSuggestionText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
  text = text.replace(/^[-*•\d.)\s]+/, "").trim();
  if (!text) return null;
  if (text.length > SUGGESTED_REPLY_MAX_TEXT_LENGTH) {
    text = `${text.slice(0, SUGGESTED_REPLY_MAX_TEXT_LENGTH - 1).trim()}…`;
  }
  if (PROMPT_LEAK_PATTERNS.some((pattern) => pattern.test(text))) return null;
  if (/^\s*[{[]/.test(text) && /[}\]]\s*$/.test(text)) return null;
  return text;
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("empty_model_output");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("invalid_json");
  }
}

/**
 * Validate/sanitize model output into 3–5 unique short draft strings.
 * Throws when output cannot be safely used (caller should fall back).
 */
export function parseAndValidateSuggestedReplyOutput(rawText: string): string[] {
  if (PROMPT_LEAK_PATTERNS.some((pattern) => pattern.test(rawText))) {
    throw new Error("prompt_leakage");
  }

  let parsed: unknown;
  try {
    parsed = extractJsonObject(rawText);
  } catch {
    // Line-based salvage for plain text lists
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => normalizeSuggestionText(line))
      .filter((line): line is string => Boolean(line));
    const uniqueLines = dedupeSuggestions(lines);
    if (uniqueLines.length >= SUGGESTED_REPLY_MIN_COUNT) {
      return uniqueLines.slice(0, SUGGESTED_REPLY_MAX_COUNT);
    }
    throw new Error("invalid_model_output");
  }

  const suggestionsRaw =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { suggestions?: unknown }).suggestions
      : Array.isArray(parsed)
        ? parsed
        : null;

  if (!Array.isArray(suggestionsRaw)) {
    throw new Error("missing_suggestions_array");
  }

  const texts: string[] = [];
  for (const entry of suggestionsRaw) {
    const text =
      typeof entry === "string"
        ? normalizeSuggestionText(entry)
        : entry && typeof entry === "object"
          ? normalizeSuggestionText((entry as { text?: unknown }).text)
          : null;
    if (text) texts.push(text);
  }

  const unique = dedupeSuggestions(texts);
  if (unique.length < SUGGESTED_REPLY_MIN_COUNT) {
    throw new Error("insufficient_suggestions");
  }
  return unique.slice(0, SUGGESTED_REPLY_MAX_COUNT);
}

export function dedupeSuggestions(texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function detectSuggestedReplyLanguage(input: {
  metadataLanguage?: string | null;
  latestCustomerMessage?: string | null;
  fallback?: "ar" | "en";
}): "ar" | "en" {
  const meta = input.metadataLanguage?.trim().toLowerCase();
  if (meta === "ar" || meta?.startsWith("ar-")) return "ar";
  if (meta === "en" || meta?.startsWith("en-")) return "en";

  const latest = input.latestCustomerMessage ?? "";
  if (/[\u0600-\u06FF]/.test(latest)) return "ar";
  if (/[A-Za-z]/.test(latest)) return "en";
  return input.fallback ?? "en";
}
