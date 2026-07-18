import { KeywordClassifier } from "./keyword-classifier.js";
import { LLMClassifier } from "./llm-classifier.js";
import { RuleBasedClassifier } from "./rule-based-classifier.js";
import type { IntentClassifier } from "./classifier-contract.js";
import type {
  CompositeClassifierConfig,
  IntentClassificationCandidate,
  IntentClassificationContext,
  IntentDefinitionRecord,
} from "../types.js";

export class CompositeClassifier implements IntentClassifier {
  readonly key = "composite" as const;

  private readonly classifiers: IntentClassifier[];

  constructor(config?: Partial<CompositeClassifierConfig>) {
    const resolved: CompositeClassifierConfig = {
      ruleBasedEnabled: config?.ruleBasedEnabled ?? true,
      keywordEnabled: config?.keywordEnabled ?? false,
      llmEnabled: config?.llmEnabled ?? false,
    };

    this.classifiers = [];
    if (resolved.ruleBasedEnabled) this.classifiers.push(new RuleBasedClassifier());
    if (resolved.keywordEnabled) this.classifiers.push(new KeywordClassifier());
    if (resolved.llmEnabled) this.classifiers.push(new LLMClassifier());
  }

  getActiveClassifierKeys(): string[] {
    return this.classifiers.map((classifier) => classifier.key);
  }

  async classify(
    context: IntentClassificationContext,
    intents: IntentDefinitionRecord[],
  ): Promise<IntentClassificationCandidate[]> {
    const merged = new Map<string, IntentClassificationCandidate>();

    for (const classifier of this.classifiers) {
      const candidates = await classifier.classify(context, intents);
      for (const candidate of candidates) {
        const existing = merged.get(candidate.intentKey);
        if (!existing || candidate.confidence > existing.confidence) {
          merged.set(candidate.intentKey, candidate);
        }
      }
    }

    return [...merged.values()].sort((a, b) => b.confidence - a.confidence);
  }
}

export function createDefaultCompositeClassifier(): CompositeClassifier {
  return new CompositeClassifier({
    ruleBasedEnabled: true,
    keywordEnabled: false,
    llmEnabled: false,
  });
}
