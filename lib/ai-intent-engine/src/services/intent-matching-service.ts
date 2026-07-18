import type { CompositeClassifier } from "../classifiers/composite-classifier.js";
import type { IntentDefinitionRepository } from "../repositories/intent-repositories.js";
import type {
  IntentAlternative,
  IntentClassificationCandidate,
  IntentClassificationContext,
  IntentDefinitionRecord,
} from "../types.js";
import { findMissingPermission, supportsConversationState } from "../repositories/intent-repositories.js";
import type { ServiceContext } from "../types.js";

export type IntentMatchingEvaluation = {
  selected: IntentDefinitionRecord;
  candidate: IntentClassificationCandidate | null;
  alternatives: IntentAlternative[];
  status: "matched" | "rejected" | "fallback" | "escalated";
  reason: string;
  requiresHuman: boolean;
  requiresLlm: boolean;
};

export class IntentMatchingService {
  constructor(
    private readonly definitionRepository: IntentDefinitionRepository,
    private readonly classifier: CompositeClassifier,
  ) {}

  getActiveClassifierKeys(): string[] {
    return this.classifier.getActiveClassifierKeys();
  }

  async classifyMessage(
    context: IntentClassificationContext,
    intents?: IntentDefinitionRecord[],
  ): Promise<IntentClassificationCandidate[]> {
    const enabledIntents = intents ?? (await this.definitionRepository.listEnabled());
    return this.classifier.classify(context, enabledIntents);
  }

  evaluateCandidates(
    ctx: ServiceContext,
    conversationState: IntentClassificationContext["conversationState"],
    candidates: IntentClassificationCandidate[],
    intents: IntentDefinitionRecord[],
    fallbackIntent: IntentDefinitionRecord,
  ): IntentMatchingEvaluation {
    const intentByKey = new Map(intents.map((intent) => [intent.key, intent]));
    const eligibleCandidates = candidates
      .map((candidate) => {
        const intent = intentByKey.get(candidate.intentKey);
        if (!intent || !intent.is_enabled || intent.key === fallbackIntent.key) return null;
        if (!supportsConversationState(intent.required_states, conversationState)) return null;
        if (findMissingPermission(ctx, intent.required_permissions)) return null;
        return { candidate, intent };
      })
      .filter((entry): entry is { candidate: IntentClassificationCandidate; intent: IntentDefinitionRecord } =>
        Boolean(entry),
      )
      .sort((a, b) => {
        if (b.candidate.confidence !== a.candidate.confidence) {
          return b.candidate.confidence - a.candidate.confidence;
        }
        return b.intent.priority - a.intent.priority;
      });

    const alternatives = eligibleCandidates.slice(1).map((entry) => ({
      intent_key: entry.candidate.intentKey,
      confidence: entry.candidate.confidence,
    }));

    const top = eligibleCandidates[0];
    if (!top) {
      return {
        selected: fallbackIntent,
        candidate: null,
        alternatives,
        status: "fallback",
        reason: "No eligible intent candidates matched the message.",
        requiresHuman: fallbackIntent.requires_human,
        requiresLlm: fallbackIntent.requires_llm,
      };
    }

    if (top.candidate.confidence < top.intent.confidence_threshold) {
      return {
        selected: fallbackIntent,
        candidate: top.candidate,
        alternatives,
        status: "fallback",
        reason: `Top intent "${top.intent.key}" confidence ${top.candidate.confidence.toFixed(3)} is below threshold ${top.intent.confidence_threshold.toFixed(3)}.`,
        requiresHuman: fallbackIntent.requires_human,
        requiresLlm: true,
      };
    }

    if (top.intent.requires_human || top.intent.key === "escalation_request") {
      return {
        selected: top.intent,
        candidate: top.candidate,
        alternatives,
        status: "escalated",
        reason: top.candidate.reason,
        requiresHuman: true,
        requiresLlm: top.intent.requires_llm,
      };
    }

    return {
      selected: top.intent,
      candidate: top.candidate,
      alternatives,
      status: "matched",
      reason: top.candidate.reason,
      requiresHuman: top.intent.requires_human,
      requiresLlm: top.intent.requires_llm,
    };
  }

  evaluatePermissionDenied(
    ctx: ServiceContext,
    conversationState: IntentClassificationContext["conversationState"],
    candidates: IntentClassificationCandidate[],
    intents: IntentDefinitionRecord[],
    fallbackIntent: IntentDefinitionRecord,
  ): IntentMatchingEvaluation | null {
    const intentByKey = new Map(intents.map((intent) => [intent.key, intent]));

    for (const candidate of candidates) {
      const intent = intentByKey.get(candidate.intentKey);
      if (!intent || !intent.is_enabled || intent.key === fallbackIntent.key) continue;
      if (!supportsConversationState(intent.required_states, conversationState)) continue;

      const missingPermission = findMissingPermission(ctx, intent.required_permissions);
      if (missingPermission && candidate.confidence >= intent.confidence_threshold) {
        return {
          selected: intent,
          candidate,
          alternatives: [],
          status: "rejected",
          reason: `Matched intent "${intent.key}" but permission "${missingPermission}" is missing.`,
          requiresHuman: false,
          requiresLlm: false,
        };
      }
    }

    return null;
  }

  evaluateUnsupportedState(
    candidates: IntentClassificationCandidate[],
    intents: IntentDefinitionRecord[],
    conversationState: IntentClassificationContext["conversationState"],
    fallbackIntent: IntentDefinitionRecord,
  ): IntentMatchingEvaluation | null {
    const intentByKey = new Map(intents.map((intent) => [intent.key, intent]));

    for (const candidate of candidates) {
      const intent = intentByKey.get(candidate.intentKey);
      if (!intent || intent.key === fallbackIntent.key) continue;
      if (candidate.confidence < intent.confidence_threshold) continue;
      if (!supportsConversationState(intent.required_states, conversationState)) {
        return {
          selected: fallbackIntent,
          candidate,
          alternatives: [],
          status: "fallback",
          reason: `Intent "${intent.key}" is not supported in state "${conversationState}".`,
          requiresHuman: fallbackIntent.requires_human,
          requiresLlm: true,
        };
      }
    }

    return null;
  }
}
