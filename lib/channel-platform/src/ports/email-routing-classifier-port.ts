/**
 * Optional inbound email routing classification port.
 * Compatible with EmailRoutingClassifier from @workspace/ai-intent-engine
 * (LlmEmailRoutingClassifier / RuleBasedEmailRoutingClassifier).
 */
export type EmailRoutingClassificationCategory =
  | "sales"
  | "support"
  | "billing"
  | "complaint"
  | "hr"
  | "general_inquiry";

export type EmailRoutingClassificationSource = "rule_based" | "llm";

export type EmailRoutingClassificationInput = {
  subject?: string | null;
  body?: string | null;
  companyId?: string | null;
};

export type EmailRoutingClassificationResult = {
  category: EmailRoutingClassificationCategory;
  confidence: number;
  subcategory?: string | null;
  reason: string;
  source: EmailRoutingClassificationSource;
  classifiedTextPreview?: string;
};

/** Runtime-retained shape for Sprint 4 (no body preview). */
export type EmailRoutingClassificationRuntime = {
  category: EmailRoutingClassificationCategory;
  confidence: number;
  subcategory?: string | null;
  reason: string;
  source: EmailRoutingClassificationSource;
};

export type EmailRoutingClassifierPort = {
  classify(input: EmailRoutingClassificationInput): Promise<EmailRoutingClassificationResult>;
};

export function toEmailRoutingClassificationRuntime(
  result: EmailRoutingClassificationResult,
): EmailRoutingClassificationRuntime {
  return {
    category: result.category,
    confidence: result.confidence,
    subcategory: result.subcategory ?? null,
    reason: result.reason,
    source: result.source,
  };
}

/** Compatible with EmailRoutingEngine from @workspace/ai-intent-engine. */
export type EmailRoutingTargetType =
  | "unresolved"
  | "department"
  | "team"
  | "queue"
  | "employee";

export type EmailRoutingDecisionRuntime = {
  targetType: EmailRoutingTargetType;
  targetId: string | null;
  category: EmailRoutingClassificationCategory;
  confidence: number;
  reason: string;
  source: "classification";
  configurationRequired: boolean;
};

export type EmailRoutingEnginePort = {
  route(input: {
    companyId?: string | null;
    classification: EmailRoutingClassificationRuntime;
  }): Promise<EmailRoutingDecisionRuntime>;
};

export function toEmailRoutingDecisionRuntime(
  result: EmailRoutingDecisionRuntime,
): EmailRoutingDecisionRuntime {
  return {
    targetType: result.targetType,
    targetId: result.targetId,
    category: result.category,
    confidence: result.confidence,
    reason: result.reason,
    source: "classification",
    configurationRequired: Boolean(result.configurationRequired),
  };
}
