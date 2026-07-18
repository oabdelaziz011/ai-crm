import type {
  IntentClassificationCandidate,
  IntentClassificationContext,
  IntentDefinitionRecord,
} from "../types.js";

export interface IntentClassifier {
  readonly key: IntentClassificationCandidate["classifierKey"];
  classify(
    context: IntentClassificationContext,
    intents: IntentDefinitionRecord[],
  ): Promise<IntentClassificationCandidate[]>;
}
