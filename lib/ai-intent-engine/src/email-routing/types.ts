import type { EmailRoutingCategory } from "./categories.js";

/** Source of the classification decision (Sprint 1 = rule_based; Sprint 2 may add llm). */
export type EmailRoutingClassifierSource = "rule_based" | "llm";

/**
 * Input for AI Email Routing classification.
 * Prefer normalized inbound email: subject from metadata.subject, body from text.
 */
export type EmailClassificationInput = {
  subject?: string | null;
  body?: string | null;
  /** Optional company context for future provider/entitlement wiring (unused in Sprint 1 rules). */
  companyId?: string | null;
};

export type EmailClassificationResult = {
  /** Primary category — always one of the six supported codes. */
  category: EmailRoutingCategory;
  /** Confidence in [0, 1]. */
  confidence: number;
  /** Optional finer label when the classifier can supply one cleanly. */
  subcategory?: string | null;
  /** Human-readable match reason for observability / Sprint 2 debugging. */
  reason: string;
  /** Which classifier produced the result. */
  source: EmailRoutingClassifierSource;
  /** Combined subject+body text that was scored (normalized). */
  classifiedTextPreview: string;
};
