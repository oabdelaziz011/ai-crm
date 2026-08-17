import type { EmailRoutingCategory } from "./categories.js";
import type { EmailClassificationResult } from "./types.js";

/**
 * Routing target kinds. No configured department/team/queue targets exist yet
 * (Sprint 7 will supply configuration). Until then decisions are unresolved.
 */
export type EmailRoutingTargetType =
  | "unresolved"
  | "department"
  | "team"
  | "queue"
  | "employee";

export type EmailRoutingDecisionSource = "classification";

export type EmailRoutingEngineInput = {
  companyId?: string | null;
  classification: Pick<
    EmailClassificationResult,
    "category" | "confidence" | "subcategory" | "reason" | "source"
  >;
};

/**
 * Deterministic routing decision for Sprint 5 assignment.
 * Does not assign employees or create tickets.
 */
export type EmailRoutingDecision = {
  targetType: EmailRoutingTargetType;
  targetId: string | null;
  /** Logical route category after policy (may differ from classification on low confidence). */
  category: EmailRoutingCategory;
  confidence: number;
  reason: string;
  source: EmailRoutingDecisionSource;
  /** True when Sprint 7 configuration is still required to resolve a concrete target. */
  configurationRequired: boolean;
};

export type EmailRoutingTargetResolution = {
  targetType: Exclude<EmailRoutingTargetType, "unresolved">;
  targetId: string;
};

/**
 * Optional resolver for company-configured category → target maps (Sprint 7).
 * Default engine treats a missing/null resolution as unresolved.
 */
export type EmailRoutingTargetResolver = {
  resolveTarget(input: {
    companyId?: string | null;
    category: EmailRoutingCategory;
  }): Promise<EmailRoutingTargetResolution | null> | EmailRoutingTargetResolution | null;
};

export type EmailRoutingEngine = {
  route(input: EmailRoutingEngineInput): Promise<EmailRoutingDecision>;
};
