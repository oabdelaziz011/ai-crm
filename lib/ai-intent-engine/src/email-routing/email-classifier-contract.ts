import type { EmailClassificationInput, EmailClassificationResult } from "./types.js";

/**
 * Contract for AI Email Routing classifiers.
 * Sprint 1: RuleBasedEmailRoutingClassifier.
 * Sprint 2: plug existing AI provider behind an EmailRoutingClassifier implementation.
 */
export interface EmailRoutingClassifier {
  readonly source: EmailClassificationResult["source"];
  classify(input: EmailClassificationInput): Promise<EmailClassificationResult>;
}
