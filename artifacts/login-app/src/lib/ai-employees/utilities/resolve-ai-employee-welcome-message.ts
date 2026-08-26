export const DEFAULT_AI_EMPLOYEE_WELCOME_MESSAGE =
  "أهلاً وسهلاً بك 👋\nكيف يمكنني مساعدتك اليوم؟";

export const MAX_AI_EMPLOYEE_WELCOME_MESSAGE_LENGTH = 1000;

export function normalizeAiEmployeeWelcomeMessageForStorage(
  value: string | null | undefined,
): string {
  return (value ?? "").trim().slice(0, MAX_AI_EMPLOYEE_WELCOME_MESSAGE_LENGTH);
}

/** Resolves the effective welcome message for display/runtime (empty storage → safe default). */
export function resolveAiEmployeeWelcomeMessage(stored: string | null | undefined): string {
  const trimmed = stored?.trim() ?? "";
  return trimmed || DEFAULT_AI_EMPLOYEE_WELCOME_MESSAGE;
}


/** Sanitize CRM customer name for deterministic welcome personalization only. */
export function sanitizeTrustedCustomerNameForWelcome(name: string): string {
  return name.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

/**
 * Phase 2 known/unknown welcome.
 * Known: deterministic greeting using CRM customers.name only.
 * Unknown: configured employee welcome unchanged.
 * Never uses WhatsApp senderName or LLM-inferred names.
 */
export function resolvePersonalizedWelcomeMessage(options: {
  storedWelcome: string | null | undefined;
  trustedCustomerName?: string | null;
}): string {
  const base = resolveAiEmployeeWelcomeMessage(options.storedWelcome);
  const raw =
    typeof options.trustedCustomerName === "string" ? options.trustedCustomerName.trim() : "";
  if (!raw) return base;
  const name = sanitizeTrustedCustomerNameForWelcome(raw);
  if (!name) return base;

  const knownGreeting = `أهلاً يا ${name} 👋`;
  const lines = base.split("\n");
  if (base === DEFAULT_AI_EMPLOYEE_WELCOME_MESSAGE || /^أهلاً/.test(lines[0] ?? "")) {
    if (lines.length > 1) return [knownGreeting, ...lines.slice(1)].join("\n");
    return knownGreeting;
  }
  return `${knownGreeting}\n${base}`;
}

export function buildWelcomeMessagePromptAddon(
  resolvedWelcome: string,
  options?: { trustedCustomerName?: string | null },
): string {
  const welcome = resolvedWelcome.trim();
  if (!welcome) return "";

  const trustedName =
    typeof options?.trustedCustomerName === "string"
      ? sanitizeTrustedCustomerNameForWelcome(options.trustedCustomerName)
      : "";

  const nameRules = trustedName
    ? [
        "- This welcome already includes the trusted CRM customer name. Deliver it exactly.",
        "- Never invent, infer, substitute, or replace the customer name.",
        "- Never use WhatsApp profile names, LLM-generated names, or names extracted from free text.",
      ]
    : [
        "- Do not invent or infer a customer name for the welcome.",
        "- Never use WhatsApp profile names as the customer name.",
      ];

  return [
    "CRITICAL FIRST-CONTACT WELCOME RULES:",
    "- When this is the first assistant reply in the conversation (no prior assistant/outgoing messages), use the configured welcome message below.",
    "- Deliver that welcome exactly as written — do not paraphrase or replace it with a different greeting.",
    ...nameRules,
    "- If the customer already asked a specific question in the same turn, you may append a concise answer after the welcome in the same reply.",
    "- If assistant messages already exist in this conversation, never repeat the welcome message.",
    `Configured welcome message:\n${welcome}`,
  ].join("\n");
}

/** Remove LLM welcome instructions after a deterministic WhatsApp welcome was sent. */
export function stripWelcomePromptFromSystemPrompt(systemPrompt: string): string {
  const marker = "CRITICAL FIRST-CONTACT WELCOME RULES:";
  const index = systemPrompt.indexOf(marker);
  if (index < 0) return systemPrompt;

  const before = systemPrompt.slice(0, index).trimEnd();
  const afterBlock = systemPrompt.slice(index);
  const configuredIndex = afterBlock.indexOf("Configured welcome message:\n");
  if (configuredIndex < 0) {
    return before;
  }

  const afterWelcome = afterBlock.slice(configuredIndex);
  const nextSectionMatch = afterWelcome.match(/\n\n(?=CRITICAL [A-Z])/);
  const remainder = nextSectionMatch?.index != null
    ? afterWelcome.slice(nextSectionMatch.index + 2).trimStart()
    : "";

  return [before, remainder].filter(Boolean).join("\n\n").trim();
}

/**
 * After deterministic welcome was delivered for this engagement, stop the LLM
 * from producing another first-contact greeting (e.g. "مساء النور! كيف يمكنني...").
 */
export function buildPostWelcomePromptAddon(): string {
  return [
    "CRITICAL POST-WELCOME RULES:",
    "- The configured first-contact welcome was already delivered for this engagement.",
    "- Do NOT send another welcome or greeting opener (no أهلاً / مساء النور / صباح النور / كيف يمكنني مساعدتك اليوم as a welcome).",
    "- If the customer only greets, reply with one short acknowledgment that invites their actual request — without repeating first-contact welcome style.",
  ].join("\n");
}

/** Strip first-contact welcome instructions and attach post-welcome anti-greet rules. */
export function applyPostWelcomeSystemPrompt(systemPrompt: string): string {
  const stripped = stripWelcomePromptFromSystemPrompt(systemPrompt);
  if (stripped.includes("CRITICAL POST-WELCOME RULES:")) return stripped;
  return [stripped, buildPostWelcomePromptAddon()].filter(Boolean).join("\n\n").trim();
}
