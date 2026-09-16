/**
 * Email Workspace AI helpers — platform AI only.
 * Never sends email; callers insert text into the composer.
 */

export type EmailAiAssistAction =
  | "generate_reply"
  | "rewrite"
  | "formal"
  | "friendly"
  | "shorten"
  | "expand"
  | "improve"
  | "translate"
  | "change_tone";

export type EmailAiTargetLanguage = "ar" | "en";

export type EmailAiChatCompletion = (body: {
  companyId: string;
  conversationId?: string;
  providerKey?: string;
  useCase?: "chat" | "tool_calling";
  temperature?: number;
  maxTokens?: number;
  messages: Array<Record<string, unknown>>;
}) => Promise<{ text: string }>;

export type EmailAiSuggestedReplies = (body: {
  companyId: string;
  conversationId: string;
  targetLanguage?: "ar" | "en";
}) => Promise<{ suggestions: Array<{ text: string }> }>;

/** Optional overrides for unit tests — production callers omit this. */
export type EmailAiAssistDeps = {
  chatCompletion?: EmailAiChatCompletion;
  suggestedReplies?: EmailAiSuggestedReplies;
};

const ACTION_INSTRUCTIONS: Record<EmailAiAssistAction, string> = {
  generate_reply:
    "Draft a professional customer-service email reply based on the thread. Return only the email body text.",
  rewrite: "Rewrite the draft for clarity and professionalism. Return only the revised draft text.",
  formal: "Rewrite the draft in a more formal tone. Return only the revised draft text.",
  friendly:
    "Rewrite the draft in a warmer, friendly tone while remaining professional. Return only the revised draft text.",
  shorten: "Shorten the draft while keeping the essential meaning. Return only the revised draft text.",
  expand: "Expand the draft with helpful detail without inventing facts. Return only the revised draft text.",
  improve: "Improve grammar, clarity, and structure of the draft. Return only the revised draft text.",
  translate: "Translate the draft into the target language. Return only the translated draft text.",
  change_tone:
    "Adjust the draft tone to be balanced, polite, and customer-ready. Return only the revised draft text.",
};

function languageLabel(target: EmailAiTargetLanguage | undefined): string {
  return target === "ar" ? "Arabic" : "English";
}

function extractAssistantText(raw: string): string {
  let text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "";

  if (/^\s*[{[]/.test(text) && /[}\]]\s*$/.test(text)) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const candidate =
        (typeof parsed.text === "string" && parsed.text) ||
        (typeof parsed.draft === "string" && parsed.draft) ||
        (typeof parsed.body === "string" && parsed.body) ||
        (typeof parsed.summary === "string" && parsed.summary) ||
        "";
      text = candidate.trim();
    } catch {
      // keep raw text
    }
  }

  return text.trim();
}

async function resolveChatCompletion(deps?: EmailAiAssistDeps): Promise<EmailAiChatCompletion> {
  if (deps?.chatCompletion) return deps.chatCompletion;
  // Dynamic import keeps unit tests free of browser Supabase env bootstrap.
  const { platformAiChatCompletion } = await import("../platform-ai/platform-ai-api-client.js");
  return platformAiChatCompletion;
}

async function resolveSuggestedReplies(deps?: EmailAiAssistDeps): Promise<EmailAiSuggestedReplies> {
  if (deps?.suggestedReplies) return deps.suggestedReplies;
  const { platformAiSuggestedReplies } = await import("../platform-ai/platform-ai-api-client.js");
  return platformAiSuggestedReplies;
}

/**
 * Generate or transform an email draft via platform chat completion.
 * Returns text only — never dispatches / sends.
 */
export async function generateEmailAiDraft(
  input: {
    companyId: string;
    /** Optional — omit for template-editor transforms (still company-scoped). */
    conversationId?: string;
    action: EmailAiAssistAction;
    threadText: string;
    draftText: string;
    targetLanguage: EmailAiTargetLanguage;
    ticketSummary?: string;
    customerName?: string;
  },
  deps?: EmailAiAssistDeps,
): Promise<string> {
  const chatCompletion = await resolveChatCompletion(deps);
  const language = languageLabel(input.targetLanguage);
  const instruction = ACTION_INSTRUCTIONS[input.action];

  const response = await chatCompletion({
    companyId: input.companyId,
    conversationId: input.conversationId,
    providerKey: "openai",
    useCase: "chat",
    temperature: 0.4,
    maxTokens: 1200,
    messages: [
      {
        role: "system",
        content: [
          "You assist agents composing email in a CRM email workspace.",
          "Return ONLY the email body text the agent can paste into the composer.",
          "Do not include subject lines, labels, markdown fences, or chain-of-thought.",
          "Do not send email or call tools.",
          "Do not upload, delete, or modify attachments or recipients.",
          "If the thread is empty, write only from the current draft or the requested action. Do not invent customer names, ticket numbers, bookings, or other CRM facts.",
          `Prefer ${language} unless the draft/thread clearly requires another language.`,
          instruction,
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          input.customerName ? `Customer name: ${input.customerName}` : null,
          input.ticketSummary ? `Ticket context: ${input.ticketSummary}` : null,
          "Thread:",
          input.threadText.trim() || "(empty)",
          "",
          "Current draft:",
          input.draftText.trim() || "(empty)",
          "",
          `Action: ${input.action}`,
          `Target language: ${language}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  return extractAssistantText(response.text ?? "");
}

/**
 * Suggested reply chips — insert on click only; never auto-send.
 */
export async function fetchEmailSuggestedReplies(
  input: {
    companyId: string;
    conversationId: string;
    targetLanguage: EmailAiTargetLanguage;
  },
  deps?: EmailAiAssistDeps,
): Promise<string[]> {
  const suggestedReplies = await resolveSuggestedReplies(deps);
  const response = await suggestedReplies({
    companyId: input.companyId,
    conversationId: input.conversationId,
    targetLanguage: input.targetLanguage,
  });
  return (response.suggestions ?? [])
    .map((item) => (typeof item?.text === "string" ? item.text.trim() : ""))
    .filter(Boolean)
    .slice(0, 5);
}

/**
 * Concise thread summary for agent awareness — never sent as email.
 */
export async function generateEmailThreadSummary(
  input: {
    companyId: string;
    threadText: string;
    targetLanguage: EmailAiTargetLanguage;
  },
  deps?: EmailAiAssistDeps,
): Promise<string> {
  const chatCompletion = await resolveChatCompletion(deps);
  const language = languageLabel(input.targetLanguage);

  const response = await chatCompletion({
    companyId: input.companyId,
    providerKey: "openai",
    useCase: "chat",
    temperature: 0.2,
    maxTokens: 500,
    messages: [
      {
        role: "system",
        content: [
          "Summarize an email support thread for a human agent.",
          "Be concise. Cover: customer intent, issue, prior actions, next recommended action.",
          "Do not include chain-of-thought, speculation, or send any message.",
          `Write the summary in ${language}.`,
          "Return only the summary text.",
        ].join("\n"),
      },
      {
        role: "user",
        content: input.threadText.trim() || "(empty thread)",
      },
    ],
  });

  return extractAssistantText(response.text ?? "");
}
