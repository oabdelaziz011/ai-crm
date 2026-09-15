import type { ConversationLanguage } from "./conversation-language.js";

/**
 * Greeting-only inbound — not a real customer intent.
 * Must still receive the workflow welcome / "how can I help" prompt.
 */
const GREETING_CORE =
  /^(?:hi+|hii+|hello|hey+|yo|hiya|salam|salaam|هاي+|هالو+|هلا+|مرحبا+|مرحبًا|اهلا+|أهلا+|اهلاً|أهلاً|السلام عليكم(?:\s*ورحمة\s*الله(?:\s*وبركاته)?)?|السلام|سلام|صباح الخير|مساء الخير|good\s+morning|good\s+evening|good\s+afternoon|morning|evening|greetings)(?:\s+(?:there|بك|بيك|يا\s*فندم))?$/iu;

function compactRepeatedLetters(value: string): string {
  return value.replace(/(.)\1+/gu, "$1");
}

function normalizeGreetingText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[!?.؟,~،]+/g, " ")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGreetingOnlyUtterance(text: string | null | undefined): boolean {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw || raw.length > 48) return false;
  const normalized = normalizeGreetingText(raw);
  if (!normalized) return false;
  if (GREETING_CORE.test(normalized)) return true;
  const compacted = compactRepeatedLetters(normalized);
  return compacted !== normalized && GREETING_CORE.test(compacted);
}

export function isClarifyIntentPrompt(prompt: string | null | undefined): boolean {
  const value = typeof prompt === "string" ? prompt.trim() : "";
  if (!value) return false;
  return /وضح طلبك|clarify your (?:request|question)|please (?:clarify|specify)/iu.test(value);
}

export function helpPromptForGreeting(language: ConversationLanguage | null | undefined): string {
  return language === "en" ? "Hi! How can I help you?" : "اهلا بيك يا فندم اقدر اساعدك ازاي ؟";
}

/** Prompt to re-ask after a greeting-only reply instead of treating it as intent. */
export function promptAfterGreetingOnlyInput(input: {
  currentPrompt: string | null | undefined;
  language: ConversationLanguage | null | undefined;
  inputKey: string;
}): string {
  const current = typeof input.currentPrompt === "string" ? input.currentPrompt.trim() : "";
  if (input.inputKey === "customer_intent" && (!current || isClarifyIntentPrompt(current))) {
    return helpPromptForGreeting(input.language);
  }
  return current || helpPromptForGreeting(input.language);
}

/**
 * After a finished/expired session, feed a real intent into AI Decision and skip welcome.
 * Greetings must not take this path — they would otherwise classify as "other" → "وضح طلبك".
 */
export function buildIntentReentryStartVariables(inboundText: string): Record<string, unknown> | null {
  const text = inboundText.trim();
  if (!text || isGreetingOnlyUtterance(text)) return null;
  return {
    lastMessage: text,
    customer_intent: text,
    __reentrySkipWelcome: true,
    __reentryConsumeIntent: true,
  };
}
