import type { EmailRoutingClassifier } from "./email-classifier-contract.js";
import { createRuleBasedEmailRoutingClassifier } from "./rule-based-email-classifier.js";
import type { EmailClassificationInput, EmailClassificationResult } from "./types.js";

let defaultClassifier: EmailRoutingClassifier | null = null;

function getDefaultClassifier(): EmailRoutingClassifier {
  if (!defaultClassifier) {
    defaultClassifier = createRuleBasedEmailRoutingClassifier();
  }
  return defaultClassifier;
}

/**
 * Classify an inbound email for AI Email Routing.
 * Default remains rule-based. Pass createLlmEmailRoutingClassifier(gateway) for LLM.
 */
export async function classifyInboundEmail(
  input: EmailClassificationInput,
  classifier: EmailRoutingClassifier = getDefaultClassifier(),
): Promise<EmailClassificationResult> {
  return classifier.classify(input);
}

/**
 * Build classifier input from normalized inbound message fields
 * (subject from metadata.subject, body from normalized text).
 */
export function emailClassificationInputFromNormalized(input: {
  text?: string | null;
  metadata?: Record<string, unknown> | null;
  companyId?: string | null;
}): EmailClassificationInput {
  const subject =
    typeof input.metadata?.subject === "string" ? input.metadata.subject : null;
  return {
    subject,
    body: input.text ?? null,
    companyId: input.companyId ?? null,
  };
}
