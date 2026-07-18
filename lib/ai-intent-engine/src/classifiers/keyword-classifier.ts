import type { IntentClassifier } from "./classifier-contract.js";
import type {
  IntentClassificationCandidate,
  IntentClassificationContext,
  IntentDefinitionRecord,
} from "../types.js";

/**
 * Placeholder classifier reserved for future keyword-index matching.
 * Does not execute in Sprint 2.5.
 */
export class KeywordClassifier implements IntentClassifier {
  readonly key = "keyword" as const;

  async classify(
    _context: IntentClassificationContext,
    _intents: IntentDefinitionRecord[],
  ): Promise<IntentClassificationCandidate[]> {
    return [];
  }
}
