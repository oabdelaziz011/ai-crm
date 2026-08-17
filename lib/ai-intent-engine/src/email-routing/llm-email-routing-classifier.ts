import {
  DEFAULT_EMAIL_ROUTING_CATEGORY,
  EMAIL_ROUTING_CATEGORIES,
  isEmailRoutingCategory,
  type EmailRoutingCategory,
} from "./categories.js";
import type { EmailRoutingClassifier } from "./email-classifier-contract.js";
import type {
  EmailRoutingChatGateway,
  LlmEmailRoutingClassifierOptions,
} from "./llm-gateway-port.js";
import type { EmailClassificationInput, EmailClassificationResult } from "./types.js";

const SYSTEM_PROMPT = `You classify inbound business emails for routing.
Return ONLY a JSON object with these fields:
- "category": one of ${EMAIL_ROUTING_CATEGORIES.map((c) => `"${c}"`).join(", ")}
- "confidence": number between 0 and 1
- "reason": short explanation (no email body quotes longer than 20 words)
- "subcategory": optional string or null

Rules:
- Consider BOTH subject and body.
- Choose exactly ONE category from the allowed list.
- If unsure, use "general_inquiry" with low confidence.
- Do not invent categories.
- Do not include markdown or extra text outside JSON.`;

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function previewText(subject: string, body: string): string {
  const combined = [subject, body].filter(Boolean).join("\n");
  return combined.slice(0, 240);
}

function buildUserPrompt(subject: string, body: string): string {
  return [
    "Classify this email.",
    "",
    `Subject: ${subject || "(empty)"}`,
    "",
    "Body:",
    body || "(empty)",
  ].join("\n");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty_model_response");

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("malformed_json");
  }
}

function clampConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

function safeLlmResult(input: {
  subject: string;
  body: string;
  reason: string;
  confidence?: number;
}): EmailClassificationResult {
  return {
    category: DEFAULT_EMAIL_ROUTING_CATEGORY,
    confidence: input.confidence ?? 0.15,
    subcategory: null,
    reason: input.reason,
    source: "llm",
    classifiedTextPreview: previewText(input.subject, input.body),
  };
}

/**
 * LLM-backed AI Email Routing classifier.
 * Uses the existing AI gateway/provider path (chatCompletion + json response_format).
 */
export class LlmEmailRoutingClassifier implements EmailRoutingClassifier {
  readonly source = "llm" as const;

  constructor(
    private readonly gateway: EmailRoutingChatGateway,
    private readonly options: LlmEmailRoutingClassifierOptions = {},
  ) {}

  async classify(input: EmailClassificationInput): Promise<EmailClassificationResult> {
    const subject = normalize(input.subject);
    const body = normalize(input.body);
    const classifiedTextPreview = previewText(subject, body);

    if (!subject && !body) {
      return safeLlmResult({
        subject,
        body,
        reason: "Empty subject and body; defaulting to general_inquiry",
        confidence: 0.1,
      });
    }

    const companyId = input.companyId?.trim() || "unknown";
    const providerKey = this.options.providerKey ?? "openai";

    try {
      const response = await this.gateway.chatCompletion({
        providerKey,
        model: this.options.model,
        temperature: this.options.temperature ?? 0,
        maxTokens: this.options.maxTokens ?? 256,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(subject, body) },
        ],
        context: {
          companyId,
          userId: null,
        },
        metadata: {
          response_format: "json",
          companyId,
          // Platform/proxy metadata may be supplied by caller wiring in later sprints.
        },
      });

      return this.parseModelText(response.text ?? "", subject, body, classifiedTextPreview);
    } catch (error) {
      const message = error instanceof Error ? error.message : "provider_failure";
      return safeLlmResult({
        subject,
        body,
        reason: `LLM classification failed: ${message.slice(0, 120)}`,
        confidence: 0.12,
      });
    }
  }

  private parseModelText(
    text: string,
    subject: string,
    body: string,
    classifiedTextPreview: string,
  ): EmailClassificationResult {
    try {
      const parsed = extractJsonObject(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return safeLlmResult({
          subject,
          body,
          reason: "Malformed LLM response: expected JSON object",
        });
      }

      const record = parsed as Record<string, unknown>;
      const rawCategory = typeof record.category === "string" ? record.category.trim().toLowerCase() : "";
      const confidence = clampConfidence(record.confidence);

      if (!isEmailRoutingCategory(rawCategory)) {
        return safeLlmResult({
          subject,
          body,
          reason: `Unsupported category from LLM: ${rawCategory || "(missing)"}`,
        });
      }

      if (confidence === null) {
        return safeLlmResult({
          subject,
          body,
          reason: "Invalid confidence from LLM; defaulting to general_inquiry",
        });
      }

      const subcategory =
        typeof record.subcategory === "string" && record.subcategory.trim()
          ? record.subcategory.trim().slice(0, 80)
          : null;
      const reason =
        typeof record.reason === "string" && record.reason.trim()
          ? record.reason.trim().slice(0, 240)
          : `Classified as ${rawCategory}`;

      return {
        category: rawCategory as EmailRoutingCategory,
        confidence,
        subcategory,
        reason,
        source: "llm",
        classifiedTextPreview,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "parse_error";
      return safeLlmResult({
        subject,
        body,
        reason: `Malformed LLM response: ${message}`,
      });
    }
  }
}

export function createLlmEmailRoutingClassifier(
  gateway: EmailRoutingChatGateway,
  options?: LlmEmailRoutingClassifierOptions,
): LlmEmailRoutingClassifier {
  return new LlmEmailRoutingClassifier(gateway, options);
}
