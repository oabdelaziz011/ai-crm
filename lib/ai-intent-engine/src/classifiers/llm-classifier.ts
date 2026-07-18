import type { IntentClassifier } from "./classifier-contract.js";
import type {
  IntentClassificationCandidate,
  IntentClassificationContext,
  IntentDefinitionRecord,
} from "../types.js";

/**
 * Stub classifier reserved for future LLM-based intent detection.
 * Does not execute in Sprint 2.5.
 */
export class LLMClassifier implements IntentClassifier {
  readonly key = "llm" as const;

  async classify(
    _context: IntentClassificationContext,
    _intents: IntentDefinitionRecord[],
  ): Promise<IntentClassificationCandidate[]> {
    return [];
  }
}
