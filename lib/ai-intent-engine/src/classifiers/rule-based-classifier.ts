import type { IntentClassifier } from "./classifier-contract.js";
import type {
  ClassificationRules,
  IntentClassificationCandidate,
  IntentClassificationContext,
  IntentDefinitionRecord,
} from "../types.js";

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function scoreIntent(
  messageText: string,
  intent: IntentDefinitionRecord,
): { confidence: number; reason: string } | null {
  if (intent.key === "fallback") return null;

  const rules = intent.classification_rules as ClassificationRules;
  const keywords = rules.keywords ?? [];
  const phrases = rules.phrases ?? [];
  const baseConfidence = Math.min(1, Math.max(0, rules.baseConfidence ?? 0.75));
  const normalizedMessage = normalizeText(messageText);

  if (!normalizedMessage) return null;

  for (const phrase of phrases) {
    const normalizedPhrase = normalizeText(phrase);
    if (normalizedPhrase && normalizedMessage.includes(normalizedPhrase)) {
      return {
        confidence: Math.max(baseConfidence, 0.9),
        reason: `Matched phrase "${phrase}"`,
      };
    }
  }

  const matchedKeywords = keywords.filter((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return normalizedKeyword.length > 0 && normalizedMessage.includes(normalizedKeyword);
  });

  if (matchedKeywords.length === 0) return null;

  const keywordBoost = Math.min(0.25, matchedKeywords.length * 0.08);
  const confidence = Math.min(1, baseConfidence - 0.1 + keywordBoost);

  return {
    confidence,
    reason: `Matched keywords: ${matchedKeywords.join(", ")}`,
  };
}

export class RuleBasedClassifier implements IntentClassifier {
  readonly key = "rule_based" as const;

  async classify(
    context: IntentClassificationContext,
    intents: IntentDefinitionRecord[],
  ): Promise<IntentClassificationCandidate[]> {
    const candidates: IntentClassificationCandidate[] = [];

    for (const intent of intents) {
      if (!intent.is_enabled) continue;

      const score = scoreIntent(context.messageText, intent);
      if (!score) continue;

      candidates.push({
        intentKey: intent.key,
        confidence: score.confidence,
        reason: score.reason,
        classifierKey: this.key,
      });
    }

    return candidates.sort((a, b) => b.confidence - a.confidence);
  }
}
