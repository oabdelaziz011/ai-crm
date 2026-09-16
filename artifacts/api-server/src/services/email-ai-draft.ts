/**
 * ValueOR Email AI Draft Copilot — generate/rewrite draft content ONLY.
 * Never imports or calls outbound send / SMTP / Graph / dispatchOutboundMessage.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPlatformAIProviderServices } from "@workspace/platform-ai-provider";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { createAiTokensCommercialPort } from "../platform/ai-tokens-commercial-adapter.js";
import { HttpError } from "../middleware/error-handler.js";

export const EMAIL_AI_DRAFT_FEATURE_CODE = "ai_assistant";
export const EMAIL_AI_DRAFT_PERMISSION = "ai.conversations.reply";

export type EmailAiDraftMode = "generate" | "rewrite";
export type EmailAiDraftTone = "professional" | "formal" | "friendly" | "concise";
export const EMAIL_AI_DRAFT_RESOLVED_LANGUAGES = ["ar", "en", "fr", "de", "es"] as const;
export type EmailAiDraftResolvedLanguage = (typeof EMAIL_AI_DRAFT_RESOLVED_LANGUAGES)[number];
export type EmailAiDraftLanguage = "auto" | EmailAiDraftResolvedLanguage;

export function isEmailAiDraftResolvedLanguage(
  value: string,
): value is EmailAiDraftResolvedLanguage {
  return (EMAIL_AI_DRAFT_RESOLVED_LANGUAGES as readonly string[]).includes(value);
}

export function emailAiDraftLanguageDisplayName(code: EmailAiDraftResolvedLanguage): string {
  if (code === "ar") return "Arabic";
  if (code === "fr") return "French";
  if (code === "de") return "German";
  if (code === "es") return "Spanish";
  return "English";
}

export type EmailAiDraftRequest = {
  client: SupabaseClient;
  companyId: string;
  userId: string | null;
  instruction: string;
  mode: EmailAiDraftMode;
  outputLanguage: EmailAiDraftLanguage;
  tone: EmailAiDraftTone;
  subject?: string | null;
  body?: string | null;
  conversationId?: string | null;
  updateSubject?: boolean;
  /** True when Email Composer already shows/appends a company signature (body stays signature-free). */
  hasExistingSignature?: boolean;
};

export type EmailAiDraftResult = {
  subject: string;
  body: string;
  language: EmailAiDraftResolvedLanguage;
  tone: EmailAiDraftTone;
  model: string;
  providerKey: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  latencyMs: number;
};

const SYSTEM_PROMPT_BASE = [
  "You are ValueOR Email Copilot.",
  "Your job is to transform the user's natural-language instructions into a professional email draft.",
  "You NEVER send emails.",
  "You NEVER trigger outbound email APIs.",
  "You NEVER call dispatchOutboundMessage.",
  "You NEVER create delivery queue records.",
  "You ONLY generate draft content for human review.",
  "Understand Arabic, English, French, German, Spanish, and mixed-language instructions.",
  "Preserve the user's intended meaning.",
  "Do not invent facts, prices, dates, commitments, policies, order numbers, names, or promises.",
  "When information is missing, use neutral wording or placeholders rather than inventing facts.",
  "Do not include markdown fences or chain-of-thought.",
  "Return ONLY a single JSON object with keys: subject, body, language, tone.",
  'language must be one of: "ar", "en", "fr", "de", "es".',
  'tone must be one of: professional, formal, friendly, concise.',
].join("\n");

const SYSTEM_PROMPT_NO_SIGNATURE = [
  "Do NOT generate an email signature or standalone closing/sign-off block.",
  'Do NOT end the body with closings such as "Best regards", "Kind regards", "Warm regards", "Sincerely", "Yours sincerely", "Regards", "Best", "Thanks", or "Thank you," as a standalone sign-off line.',
  "Do NOT append agent/user/company names, titles, phone numbers, or contact details as a signature.",
  "The Email Composer already manages the company signature separately (Brand Center) and will append it.",
  "Return only the message content that should appear BEFORE the existing composer signature.",
  "Never duplicate an existing signature.",
  'Natural in-body sentences are allowed and REQUIRED to stay (e.g. "Thank you for your patience.", "Thanks for contacting us.", "We appreciate your cooperation.", "Please confirm the address. Thank you.", "Regards to the team.").',
  "Standalone sign-off blocks at the END of the email are forbidden.",
].join("\n");

export function buildEmailAiDraftSystemPrompt(input?: { hasExistingSignature?: boolean }): string {
  if (input?.hasExistingSignature === true) {
    return `${SYSTEM_PROMPT_BASE}\n${SYSTEM_PROMPT_NO_SIGNATURE}`;
  }
  return [
    SYSTEM_PROMPT_BASE,
    "Prefer not to invent a signature block; keep the body focused on the message content.",
  ].join("\n");
}

/**
 * Remove a trailing standalone sign-off block (phrase + optional short name/company lines).
 * Does not remove in-body sentences like "Thank you for your patience." or "Regards to the team."
 */
export function stripStandaloneEmailSignOff(body: string): string {
  const text = String(body ?? "").replace(/\s+$/u, "");
  if (!text) return text;

  const lines = text.split(/\r?\n/);
  let lastContent = lines.length - 1;
  while (lastContent >= 0 && !lines[lastContent].trim()) lastContent--;
  if (lastContent < 0) return "";

  // Scan a short trailing window for a standalone sign-off phrase line.
  let cutAt: number | null = null;
  let scanned = 0;
  for (let i = lastContent; i >= 0 && scanned < 6; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    scanned++;
    if (isStandaloneSignOffLine(trimmed)) {
      cutAt = i;
    } else if (cutAt === null && !looksLikeTrailingIdentityLine(trimmed)) {
      // Hit real body content before any sign-off — stop.
      break;
    }
  }

  if (cutAt === null) return text;

  for (let k = cutAt + 1; k < lines.length; k++) {
    const trimmed = lines[k].trim();
    if (!trimmed) continue;
    if (!looksLikeTrailingIdentityLine(trimmed)) {
      return text;
    }
  }

  return lines.slice(0, cutAt).join("\n").replace(/\s+$/u, "");
}

function isStandaloneSignOffLine(line: string): boolean {
  const normalized = line.trim();
  if (!normalized) return false;
  // Keep legitimate body sentences.
  if (/\bthank you for\b/i.test(normalized)) return false;
  if (/\bthanks for\b/i.test(normalized)) return false;
  if (/\bwe appreciate\b/i.test(normalized)) return false;
  if (/\bregards to\b/i.test(normalized)) return false;
  if (/\bwith thanks for\b/i.test(normalized)) return false;
  // Keep "Please … Thank you." style sentences (not a lone closing line).
  if (/\bthank you\.?\s*$/i.test(normalized) && /\b(please|confirm|send|provide|verify)\b/i.test(normalized)) {
    return false;
  }
  return /^(?:with\s+)?(?:best\s+regards|kind\s+regards|warm\s+regards|yours?\s+sincerely|yours?\s+truly|best\s+wishes|regards|sincerely|best|thanks|thank\s+you|مع خالص التحية|أطيب التحيات|مع التحية|تحياتي)\s*[,!.]?\s*$/i.test(
    normalized,
  );
}

function looksLikeTrailingIdentityLine(line: string): boolean {
  const normalized = line.trim();
  if (!normalized) return true;
  if (normalized.length > 80) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 8) return false;
  // Avoid cutting a real sentence after a false-positive sign-off.
  if (/[.!?].+\S/.test(normalized) && words.length > 4) return false;
  return true;
}

export function applyEmailAiDraftBodyGuards(
  body: string,
  input?: { hasExistingSignature?: boolean },
): string {
  const trimmed = String(body ?? "").trim();
  if (!trimmed) return trimmed;
  if (input?.hasExistingSignature !== true) return trimmed;
  return stripStandaloneEmailSignOff(trimmed);
}

export function parseAndValidateEmailAiDraftOutput(raw: string): {
  subject: string;
  body: string;
  language: EmailAiDraftResolvedLanguage;
  tone: EmailAiDraftTone;
} {
  let text = (raw ?? "").trim();
  if (!text) {
    throw new HttpError(502, "AI returned an empty draft.", "email_ai_draft_empty");
  }

  // Strip optional markdown fences
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fence?.[1]) text = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try to extract first JSON object
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch {
        throw new HttpError(502, "AI returned a malformed draft.", "email_ai_draft_malformed");
      }
    } else {
      throw new HttpError(502, "AI returned a malformed draft.", "email_ai_draft_malformed");
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(502, "AI returned a malformed draft.", "email_ai_draft_malformed");
  }

  const record = parsed as Record<string, unknown>;
  const subject = typeof record.subject === "string" ? record.subject.trim() : "";
  const body = typeof record.body === "string" ? record.body.trim() : "";
  if (!body) {
    throw new HttpError(502, "AI returned an empty body.", "email_ai_draft_empty");
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

  return { subject, body, language, tone };
}

function detectInstructionLanguage(instruction: string): EmailAiDraftResolvedLanguage {
  const arabic = (instruction.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (instruction.match(/[A-Za-z]/g) ?? []).length;
  return arabic > latin ? "ar" : "en";
}

export function resolveEmailAiDraftOutputLanguage(
  outputLanguage: EmailAiDraftLanguage,
  instruction: string,
  body: string,
): EmailAiDraftResolvedLanguage {
  if (isEmailAiDraftResolvedLanguage(outputLanguage)) return outputLanguage;
  if (/(بالفرنسي|بالفرنسية|french|en français|en francais)/i.test(instruction)) return "fr";
  if (/(بالالماني|بالألماني|بالألمانية|german|auf deutsch)/i.test(instruction)) return "de";
  if (/(بالاسباني|بالإسباني|بالإسبانية|spanish|en español|en espanol)/i.test(instruction)) {
    return "es";
  }
  if (/(بالانجليزي|بالإنجليزي|english|in english)/i.test(instruction)) return "en";
  if (/(بالعربي|arabic|in arabic)/i.test(instruction)) return "ar";
  if (body.trim()) return detectInstructionLanguage(body);
  return detectInstructionLanguage(instruction);
}

async function loadTrustedDraftContext(
  client: SupabaseClient,
  companyId: string,
  conversationId: string | null | undefined,
): Promise<{
  companyName: string;
  customerName: string | null;
  customerEmail: string | null;
  threadText: string;
  conversationOk: boolean;
}> {
  const { data: company } = await client
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();

  const companyName =
    typeof company?.name === "string" && company.name.trim() ? company.name.trim() : "our company";

  if (!conversationId) {
    return {
      companyName,
      customerName: null,
      customerEmail: null,
      threadText: "",
      conversationOk: true,
    };
  }

  const { data: conversation, error } = await client
    .from("conversations")
    .select("id, company_id, customer_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load conversation", "conversation_load_failed");
  }
  if (!conversation || String(conversation.company_id) !== companyId) {
    throw new HttpError(404, "Conversation not found", "conversation_not_found");
  }

  let customerName: string | null = null;
  let customerEmail: string | null = null;
  if (conversation.customer_id) {
    const { data: customer } = await client
      .from("customers")
      .select("name, email")
      .eq("id", conversation.customer_id)
      .eq("company_id", companyId)
      .maybeSingle();
    customerName = typeof customer?.name === "string" ? customer.name : null;
    customerEmail = typeof customer?.email === "string" ? customer.email : null;
  }

  const { data: messages } = await client
    .from("conversation_messages")
    .select("message_type, content, created_at")
    .eq("conversation_id", conversationId)
    .in("message_type", ["incoming", "outgoing"])
    .order("created_at", { ascending: false })
    .limit(12);

  const threadText = (messages ?? [])
    .slice()
    .reverse()
    .map((row) => {
      const role = row.message_type === "incoming" ? "Customer" : "Agent";
      const content = typeof row.content === "string" ? row.content.trim() : "";
      return content ? `${role}: ${content.slice(0, 800)}` : null;
    })
    .filter(Boolean)
    .join("\n");

  return {
    companyName,
    customerName,
    customerEmail,
    threadText,
    conversationOk: true,
  };
}

export function buildEmailAiDraftUserPrompt(input: {
  instruction: string;
  mode: EmailAiDraftMode;
  tone: EmailAiDraftTone;
  outputLanguage: EmailAiDraftResolvedLanguage;
  subject: string;
  body: string;
  updateSubject: boolean;
  companyName: string;
  customerName: string | null;
  customerEmail: string | null;
  threadText: string;
  hasExistingSignature?: boolean;
}): string {
  return [
    `Mode: ${input.mode}`,
    `Requested tone: ${input.tone}`,
    `Output language: ${emailAiDraftLanguageDisplayName(input.outputLanguage)}`,
    `Update subject: ${input.updateSubject ? "yes" : "no (keep existing subject unless empty)"}`,
    `Composer already has signature: ${input.hasExistingSignature === true ? "yes — do not generate a sign-off or signature" : "no"}`,
    `Company name (trusted): ${input.companyName}`,
    input.customerName ? `Customer name (trusted): ${input.customerName}` : "Customer name: (unknown — do not invent)",
    input.customerEmail
      ? `Customer email (trusted): ${input.customerEmail}`
      : "Customer email: (unknown — do not invent)",
    "",
    "User instruction:",
    input.instruction,
    "",
    "Current subject:",
    input.subject.trim() || "(empty)",
    "",
    "Current draft body:",
    input.body.trim() || "(empty)",
    "",
    "Recent thread (trusted excerpts):",
    input.threadText.trim() || "(empty)",
  ].join("\n");
}

/**
 * Generate or rewrite an email draft. Returns structured text only — never sends.
 */
export async function generateEmailAiDraftServer(
  input: EmailAiDraftRequest,
): Promise<EmailAiDraftResult> {
  const instruction = input.instruction.trim();
  if (!instruction) {
    throw new HttpError(400, "instruction is required", "validation_error");
  }
  if (instruction.length > 4000) {
    throw new HttpError(400, "instruction is too long", "validation_error");
  }

  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  const mode: EmailAiDraftMode = input.mode === "rewrite" ? "rewrite" : "generate";
  const tone: EmailAiDraftTone =
    input.tone === "formal" || input.tone === "friendly" || input.tone === "concise"
      ? input.tone
      : "professional";

  const outputLanguage = resolveEmailAiDraftOutputLanguage(input.outputLanguage, instruction, body);
  // Do not treat Arabic "العنوان" (delivery address) as subject intent.
  const asksForSubject =
    /(\bsubject\b|subject line|عنوان الرسالة|عنوان البريد)/i.test(instruction);
  const updateSubject =
    Boolean(input.updateSubject) || !subject || asksForSubject;

  const hasExistingSignature = input.hasExistingSignature === true;

  const tokensCommercial = createAiTokensCommercialPort(input.client);
  const tokenAccess = await tokensCommercial.checkAccess({ companyId: input.companyId });
  if (tokenAccess.reason === "quota_exceeded") {
    throw new HttpError(429, "AI token quota exceeded", "AI_QUOTA_EXCEEDED");
  }

  const trusted = await loadTrustedDraftContext(
    input.client,
    input.companyId,
    input.conversationId,
  );

  const platform = createPlatformAIProviderServices(input.client);
  const providers = createAIProviderServices(input.client);
  const runtime = await platform.platform.resolveRuntimeConfig(input.companyId, "openai", "chat");

  const started = Date.now();
  const executionId = `email-ai-draft:${input.companyId}:${started}`;
  const response = await providers.gateway.chatCompletion({
    providerKey: runtime.providerKey,
    model: runtime.model,
    temperature: 0.35,
    maxTokens: 1600,
    messages: [
      { role: "system", content: buildEmailAiDraftSystemPrompt({ hasExistingSignature }) },
      {
        role: "user",
        content: buildEmailAiDraftUserPrompt({
          instruction,
          mode,
          tone,
          outputLanguage,
          subject,
          body,
          updateSubject,
          companyName: trusted.companyName,
          customerName: trusted.customerName,
          customerEmail: trusted.customerEmail,
          threadText: trusted.threadText,
          hasExistingSignature,
        }),
      },
    ],
    context: {
      companyId: input.companyId,
      userId: input.userId,
      conversationId: input.conversationId ?? undefined,
      executionId,
    },
    metadata: {
      apiKey: runtime.apiKey,
      baseUrl: runtime.baseUrl,
      companyId: input.companyId,
      usesPlatformKey: true,
      response_format: "json",
      feature: "email_ai_draft",
      neverSend: true,
      mode,
      hasExistingSignature,
    },
  });

  const latencyMs = Date.now() - started;
  const parsed = parseAndValidateEmailAiDraftOutput(response.text ?? "");
  const guardedBody = applyEmailAiDraftBodyGuards(parsed.body, { hasExistingSignature });
  if (!guardedBody.trim()) {
    throw new HttpError(502, "AI returned an empty body.", "email_ai_draft_empty");
  }
  const finalSubject =
    updateSubject || !subject
      ? parsed.subject || subject || (parsed.language === "ar" ? "متابعة" : "Follow-up")
      : subject;

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
      totalTokens: usage.totalTokens,
      latencyMs,
      executionId,
      metadata: { feature: "email_ai_draft", neverSend: true, mode },
    });
  } catch {
    // Soft-fail observability — draft still returned; never send.
  }

  return {
    subject: finalSubject,
    body: guardedBody,
    language: parsed.language,
    tone: parsed.tone,
    model: response.model ?? runtime.model,
    providerKey: response.providerKey ?? runtime.providerKey,
    usage,
    latencyMs,
  };
}
