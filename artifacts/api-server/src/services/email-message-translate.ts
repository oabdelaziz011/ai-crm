/**
 * Email message translation — READ-ONLY compute.
 * Never imports or calls outbound send / SMTP / Graph / dispatch / draft persistence.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPlatformAIProviderServices } from "@workspace/platform-ai-provider";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { createAiTokensCommercialPort } from "../platform/ai-tokens-commercial-adapter.js";
import { HttpError } from "../middleware/error-handler.js";

/** Same commercial gate as Email AI Draft — translation is an AI Assistant capability. */
export const EMAIL_MESSAGE_TRANSLATE_FEATURE_CODE = "ai_assistant";
/** Same permission as draft/reply AI — no broader grant. */
export const EMAIL_MESSAGE_TRANSLATE_PERMISSION = "ai.conversations.reply";

/** Soft cap on plain-text input sent to the provider (characters). */
export const EMAIL_TRANSLATE_MAX_INPUT_CHARS = 12_000;

export type EmailTranslateLanguageCode = string;

export type EmailMessageTranslateRequest = {
  client: SupabaseClient;
  companyId: string;
  userId: string | null;
  messageId: string;
  targetLanguage: EmailTranslateLanguageCode;
};

export type EmailMessageTranslateResult = {
  sourceLanguage: string;
  sourceLanguageLabel: string;
  targetLanguage: string;
  translatedText: string;
  truncated: boolean;
  neverSend: true;
  model: string;
  providerKey: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  latencyMs: number;
};

const LANGUAGE_NAMES: Record<string, string> = {
  ar: "Arabic",
  en: "English",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  tr: "Turkish",
  nl: "Dutch",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  hi: "Hindi",
  ur: "Urdu",
  fa: "Persian",
  he: "Hebrew",
  pl: "Polish",
  sv: "Swedish",
  id: "Indonesian",
  unknown: "Unknown",
};

export function languageDisplayName(code: string): string {
  const normalized = String(code ?? "").trim().toLowerCase();
  return LANGUAGE_NAMES[normalized] ?? (normalized || "Unknown");
}

/** Heuristic source-language detection from plain text (not UI locale). */
export function detectEmailSourceLanguage(text: string): {
  code: string;
  label: string;
  confident: boolean;
} {
  const sample = String(text ?? "").slice(0, 4000);
  if (!sample.trim()) {
    return { code: "unknown", label: languageDisplayName("unknown"), confident: false };
  }

  const arabic = (sample.match(/[\u0600-\u06FF]/g) ?? []).length;
  const hebrew = (sample.match(/[\u0590-\u05FF]/g) ?? []).length;
  const cjk = (sample.match(/[\u3040-\u30FF\u3400-\u9FFF]/g) ?? []).length;
  const cyrillic = (sample.match(/[\u0400-\u04FF]/g) ?? []).length;
  const latin = (sample.match(/[A-Za-z]/g) ?? []).length;
  const letters = arabic + hebrew + cjk + cyrillic + latin;

  if (letters < 8) {
    return { code: "unknown", label: languageDisplayName("unknown"), confident: false };
  }

  if (arabic / letters > 0.35) {
    return { code: "ar", label: languageDisplayName("ar"), confident: true };
  }
  if (hebrew / letters > 0.35) {
    return { code: "he", label: languageDisplayName("he"), confident: true };
  }
  if (cjk / letters > 0.25) {
    return { code: "zh", label: languageDisplayName("zh"), confident: arabic === 0 };
  }
  if (cyrillic / letters > 0.35) {
    return { code: "ru", label: languageDisplayName("ru"), confident: true };
  }

  const lower = sample.toLowerCase();
  const frHits = (
    lower.match(/\b(bonjour|merci|veuillez|votre|vous|nous|avec|pour|une|des|les|commande)\b/g) ?? []
  ).length;
  const deHits = (
    lower.match(/\b(der|die|das|und|nicht|bitte|danke|guten|ihre|nachricht|rechnung)\b/g) ?? []
  ).length;
  const esHits = (
    lower.match(/\b(hola|gracias|usted|ustedes|para|los|las|pedido|factura|favor)\b/g) ?? []
  ).length;
  if (latin > 20) {
    const best = Math.max(frHits, deHits, esHits);
    if (best >= 2) {
      if (frHits === best && frHits > deHits && frHits > esHits) {
        return { code: "fr", label: languageDisplayName("fr"), confident: false };
      }
      if (deHits === best && deHits > frHits && deHits > esHits) {
        return { code: "de", label: languageDisplayName("de"), confident: false };
      }
      if (esHits === best && esHits > frHits && esHits > deHits) {
        return { code: "es", label: languageDisplayName("es"), confident: false };
      }
    }
  }
  if (latin / letters > 0.5) {
    return { code: "en", label: languageDisplayName("en"), confident: true };
  }

  return { code: "unknown", label: languageDisplayName("unknown"), confident: false };
}

export function defaultEmailTranslateTarget(sourceCode: string): string {
  return sourceCode === "ar" ? "en" : "ar";
}

/** Strip tags / decode basic entities for translation input. */
export function htmlToTranslatePlainText(html: string): string {
  const raw = String(html ?? "");
  if (!raw.trim()) return "";
  return raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Prefer current message body; drop obvious quoted history / forwarded blocks.
 */
export function extractIncomingEmailBodyForTranslation(input: {
  plainContent: string;
  htmlSanitized?: string | null;
}): { text: string; truncated: boolean } {
  const fromHtml = input.htmlSanitized ? htmlToTranslatePlainText(input.htmlSanitized) : "";
  let text = (fromHtml || String(input.plainContent ?? "")).trim();
  if (!text) return { text: "", truncated: false };

  const quoteMarkers = [
    /\nOn .+wrote:\s*\n/i,
    /\n-{2,}\s*Forwarded message\s*-{2,}/i,
    /\nFrom:\s.+\nSent:\s/i,
    /\n_{5,}\s*\n/,
    /\n>{2,}/,
  ];
  for (const marker of quoteMarkers) {
    const match = marker.exec(text);
    if (match?.index != null && match.index > 40) {
      text = text.slice(0, match.index).trim();
      break;
    }
  }

  let truncated = false;
  if (text.length > EMAIL_TRANSLATE_MAX_INPUT_CHARS) {
    text = text.slice(0, EMAIL_TRANSLATE_MAX_INPUT_CHARS).trimEnd();
    truncated = true;
  }
  return { text, truncated };
}

export function buildEmailTranslateSystemPrompt(): string {
  return [
    "You are ValueOR Email Translator.",
    "Your ONLY job is to translate the given email message body into the requested target language.",
    "You NEVER send emails.",
    "You NEVER call outbound email APIs.",
    "You NEVER create drafts or conversation replies.",
    "Return ONLY a single JSON object with keys: sourceLanguage, translatedText.",
    "sourceLanguage must be an ISO 639-1 code (e.g. en, ar, fr) or \"unknown\".",
    "translatedText must be plain text only (no HTML tags).",
    "Preserve paragraph breaks using blank lines.",
    "Do NOT translate URLs, email addresses, phone numbers, Message-IDs, or order/reference IDs.",
    "Do NOT invent content. Do not summarize. Translate faithfully.",
    "Keep company/product brand names unchanged when they are proper nouns.",
  ].join("\n");
}

export function buildEmailTranslateUserPrompt(input: {
  targetLanguage: string;
  targetLanguageName: string;
  sourceHint: string;
  text: string;
  truncated: boolean;
}): string {
  return [
    `Target language code: ${input.targetLanguage}`,
    `Target language name: ${input.targetLanguageName}`,
    `Heuristic source hint: ${input.sourceHint}`,
    input.truncated
      ? "NOTE: Input was truncated to a safe maximum length before translation."
      : "Input length: within limit.",
    "",
    "Email body to translate:",
    input.text,
  ].join("\n");
}

export function parseEmailTranslateOutput(raw: string): {
  sourceLanguage: string;
  translatedText: string;
} {
  let text = String(raw ?? "").trim();
  if (!text) {
    throw new HttpError(502, "AI returned an empty translation.", "email_translate_empty");
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
        throw new HttpError(502, "AI returned a malformed translation.", "email_translate_malformed");
      }
    } else {
      throw new HttpError(502, "AI returned a malformed translation.", "email_translate_malformed");
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(502, "AI returned a malformed translation.", "email_translate_malformed");
  }
  const record = parsed as Record<string, unknown>;
  const translatedText =
    typeof record.translatedText === "string" ? record.translatedText.trim() : "";
  if (!translatedText) {
    throw new HttpError(502, "AI returned an empty translation.", "email_translate_empty");
  }
  const sourceLanguage =
    typeof record.sourceLanguage === "string" && record.sourceLanguage.trim()
      ? record.sourceLanguage.trim().toLowerCase()
      : "unknown";
  return { sourceLanguage, translatedText };
}

async function loadCompanyScopedMessage(
  client: SupabaseClient,
  companyId: string,
  messageId: string,
): Promise<{
  id: string;
  conversationId: string;
  messageType: string;
  content: string;
  htmlSanitized: string | null;
}> {
  const { data: message, error } = await client
    .from("conversation_messages")
    .select("id, conversation_id, message_type, content, metadata")
    .eq("id", messageId)
    .maybeSingle();

  if (error || !message) {
    throw new HttpError(404, "Message not found.", "not_found");
  }

  const conversationId = String(message.conversation_id ?? "");
  if (!conversationId) {
    throw new HttpError(404, "Message not found.", "not_found");
  }

  const { data: conversation } = await client
    .from("conversations")
    .select("id, company_id, deleted_at")
    .eq("id", conversationId)
    .maybeSingle();

  if (
    !conversation ||
    String(conversation.company_id) !== companyId ||
    conversation.deleted_at != null
  ) {
    throw new HttpError(404, "Message not found.", "not_found");
  }

  const metadata =
    message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
      ? (message.metadata as Record<string, unknown>)
      : {};
  const htmlSanitized =
    typeof metadata.htmlSanitized === "string"
      ? metadata.htmlSanitized
      : typeof metadata.htmlOriginal === "string"
        ? metadata.htmlOriginal
        : null;

  return {
    id: String(message.id),
    conversationId,
    messageType: String(message.message_type ?? ""),
    content: typeof message.content === "string" ? message.content : "",
    htmlSanitized,
  };
}

/**
 * Translate one company-scoped email message. Pure read/compute — never persists or sends.
 */
export async function translateEmailMessageServer(
  input: EmailMessageTranslateRequest,
): Promise<EmailMessageTranslateResult> {
  const targetLanguage = String(input.targetLanguage ?? "").trim().toLowerCase();
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(targetLanguage)) {
    throw new HttpError(400, "targetLanguage is invalid", "validation_error");
  }

  const message = await loadCompanyScopedMessage(input.client, input.companyId, input.messageId);
  if (message.messageType !== "incoming") {
    throw new HttpError(400, "Only incoming messages can be translated.", "validation_error");
  }

  const extracted = extractIncomingEmailBodyForTranslation({
    plainContent: message.content,
    htmlSanitized: message.htmlSanitized,
  });
  if (!extracted.text.trim()) {
    throw new HttpError(400, "Message has no translatable content.", "validation_error");
  }

  const detected = detectEmailSourceLanguage(extracted.text);

  const tokensCommercial = createAiTokensCommercialPort(input.client);
  const tokenAccess = await tokensCommercial.checkAccess({ companyId: input.companyId });
  if (tokenAccess.reason === "quota_exceeded") {
    throw new HttpError(429, "AI token quota exceeded", "AI_QUOTA_EXCEEDED");
  }

  const platform = createPlatformAIProviderServices(input.client);
  const providers = createAIProviderServices(input.client);
  const runtime = await platform.platform.resolveRuntimeConfig(input.companyId, "openai", "chat");

  const started = Date.now();
  const executionId = `email-translate:${input.companyId}:${input.messageId}:${started}`;
  const response = await providers.gateway.chatCompletion({
    providerKey: runtime.providerKey,
    model: runtime.model,
    temperature: 0.2,
    maxTokens: 2400,
    messages: [
      { role: "system", content: buildEmailTranslateSystemPrompt() },
      {
        role: "user",
        content: buildEmailTranslateUserPrompt({
          targetLanguage,
          targetLanguageName: languageDisplayName(targetLanguage),
          sourceHint: detected.code,
          text: extracted.text,
          truncated: extracted.truncated,
        }),
      },
    ],
    context: {
      companyId: input.companyId,
      userId: input.userId,
      conversationId: message.conversationId,
      executionId,
    },
    metadata: {
      apiKey: runtime.apiKey,
      baseUrl: runtime.baseUrl,
      companyId: input.companyId,
      usesPlatformKey: true,
      response_format: "json",
      feature: "email_message_translate",
      neverSend: true,
      readOnly: true,
    },
  });

  const latencyMs = Date.now() - started;
  const parsed = parseEmailTranslateOutput(response.text ?? "");
  const sourceLanguage =
    detected.confident && detected.code !== "unknown" ? detected.code : parsed.sourceLanguage;
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
      metadata: { feature: "email_message_translate", neverSend: true, readOnly: true },
    });
  } catch {
    // Soft-fail observability — still return translation; never send.
  }

  return {
    sourceLanguage,
    sourceLanguageLabel: languageDisplayName(sourceLanguage),
    targetLanguage,
    translatedText: parsed.translatedText,
    truncated: extracted.truncated,
    neverSend: true,
    model: response.model ?? runtime.model,
    providerKey: response.providerKey ?? runtime.providerKey,
    usage,
    latencyMs,
  };
}
