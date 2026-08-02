import enCommon from "@/locales/en/common.json";
import arCommon from "@/locales/ar/common.json";
import type { CustomerTone } from "@/lib/omnichannel/types/unified-conversation";
import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import type {
  SuggestedReplyCatalogBucket,
  SuggestedReplyIntentKey,
} from "@/lib/omnichannel/types/suggested-reply-types";

type SuggestedReplySamples = Record<SuggestedReplyCatalogBucket, string[]>;

type GenerationPromptCopy = {
  system: string;
  userTemplate: string;
};

const CATALOG: Record<ResolvedConversationLanguage, SuggestedReplySamples> = {
  en: enCommon.omnichannel.suggestedReplies.samples as SuggestedReplySamples,
  ar: arCommon.omnichannel.suggestedReplies.samples as SuggestedReplySamples,
};

const GENERATION_PROMPT: Record<ResolvedConversationLanguage, GenerationPromptCopy> = {
  en: enCommon.omnichannel.suggestedReplies.generationPrompt,
  ar: arCommon.omnichannel.suggestedReplies.generationPrompt,
};

export function getSuggestedReplySamples(
  language: ResolvedConversationLanguage,
  bucket: SuggestedReplyCatalogBucket,
): string[] {
  return [...(CATALOG[language][bucket] ?? CATALOG[language].general)].slice(0, 2);
}

/** @deprecated Prefer buildIntelligentSuggestedReplies */
export function buildSuggestedRepliesFromCatalog(input: {
  targetLanguage: ResolvedConversationLanguage;
  lastCustomerMessage: string;
  tone: CustomerTone;
}): string[] {
  const text = input.lastCustomerMessage.trim();

  if (!text) return getSuggestedReplySamples(input.targetLanguage, "empty");
  if (/invoice|payment|bill|facture|فاتورة|دفع/i.test(text)) {
    return getSuggestedReplySamples(
      input.targetLanguage,
      input.tone === "angry" || input.tone === "urgent" ? "billingUrgent" : "billingNeutral",
    );
  }
  if (/booking|appointment|schedule|réservation|موعد|حجز/i.test(text)) {
    return getSuggestedReplySamples(input.targetLanguage, "scheduling");
  }
  if (/cancel|refund|complaint|استرجاع|إلغاء|شكوى/i.test(text)) {
    return getSuggestedReplySamples(
      input.targetLanguage,
      input.tone === "angry" ? "refundAngry" : "refundNeutral",
    );
  }
  if (/price|quote|offer|سعر|عرض/i.test(text)) {
    return getSuggestedReplySamples(input.targetLanguage, "salesNeutral");
  }
  if (input.tone === "confused") return getSuggestedReplySamples(input.targetLanguage, "confused");
  if (input.tone === "happy") return getSuggestedReplySamples(input.targetLanguage, "happy");
  return getSuggestedReplySamples(input.targetLanguage, "general");
}

export function buildSuggestedReplyGenerationPrompt(input: {
  targetLanguage: ResolvedConversationLanguage;
  lastCustomerMessage: string;
  tone: CustomerTone;
  intent: string;
}): {
  targetLanguage: ResolvedConversationLanguage;
  system: string;
  user: string;
} {
  const copy = GENERATION_PROMPT[input.targetLanguage];
  const languageLabel = input.targetLanguage === "ar" ? "Arabic" : "English";
  const user = copy.userTemplate
    .replace(/\{\{targetLanguage\}\}/g, languageLabel)
    .replace(/\{\{tone\}\}/g, input.tone)
    .replace(/\{\{intent\}\}/g, input.intent)
    .replace(/\{\{message\}\}/g, input.lastCustomerMessage.trim() || "—");

  return {
    targetLanguage: input.targetLanguage,
    system: copy.system,
    user,
  };
}

export function mapIntentKeyToCatalogBucket(
  intent: SuggestedReplyIntentKey,
  tone: CustomerTone,
): SuggestedReplyCatalogBucket {
  if (intent === "greeting") return "empty";
  if (intent === "billing") {
    return tone === "angry" || tone === "urgent" ? "billingUrgent" : "billingNeutral";
  }
  if (intent === "scheduling") return "scheduling";
  if (intent === "support_escalation") {
    return tone === "angry" ? "refundAngry" : "refundNeutral";
  }
  if (intent === "sales") return "salesNeutral";
  if (tone === "confused") return "confused";
  if (tone === "happy") return "happy";
  return "general";
}
