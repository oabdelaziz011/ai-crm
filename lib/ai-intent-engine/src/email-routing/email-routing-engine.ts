import {
  DEFAULT_EMAIL_ROUTING_CATEGORY,
  EMAIL_ROUTING_LOW_CONFIDENCE_THRESHOLD,
  isEmailRoutingCategory,
  type EmailRoutingCategory,
} from "./categories.js";
import type {
  EmailRoutingDecision,
  EmailRoutingEngine,
  EmailRoutingEngineInput,
  EmailRoutingTargetResolver,
} from "./email-routing-engine-contract.js";

const CATEGORY_ROUTE_LABEL: Record<EmailRoutingCategory, string> = {
  sales: "Sales",
  support: "Support",
  billing: "Billing",
  complaint: "Complaint",
  hr: "HR",
  general_inquiry: "General Inquiry",
};

export type DefaultEmailRoutingEngineOptions = {
  /**
   * Optional company category→target map (Sprint 7).
   * When omitted or returns null, decision is unresolved with configurationRequired.
   */
  targetResolver?: EmailRoutingTargetResolver;
  /** Defaults to EMAIL_ROUTING_LOW_CONFIDENCE_THRESHOLD from categories. */
  lowConfidenceThreshold?: number;
};

function normalizeCategory(value: string): EmailRoutingCategory {
  const trimmed = value.trim().toLowerCase();
  return isEmailRoutingCategory(trimmed) ? trimmed : DEFAULT_EMAIL_ROUTING_CATEGORY;
}

function unresolvedDecision(input: {
  category: EmailRoutingCategory;
  confidence: number;
  reason: string;
}): EmailRoutingDecision {
  return {
    targetType: "unresolved",
    targetId: null,
    category: input.category,
    confidence: input.confidence,
    reason: input.reason,
    source: "classification",
    configurationRequired: true,
  };
}

/**
 * Deterministic AI Email Routing Engine.
 * Consumes classification only — never calls an LLM.
 */
export class DefaultEmailRoutingEngine implements EmailRoutingEngine {
  private readonly lowConfidenceThreshold: number;

  constructor(private readonly options: DefaultEmailRoutingEngineOptions = {}) {
    this.lowConfidenceThreshold =
      options.lowConfidenceThreshold ?? EMAIL_ROUTING_LOW_CONFIDENCE_THRESHOLD;
  }

  async route(input: EmailRoutingEngineInput): Promise<EmailRoutingDecision> {
    const confidence =
      typeof input.classification.confidence === "number" &&
      Number.isFinite(input.classification.confidence)
        ? Math.min(1, Math.max(0, input.classification.confidence))
        : 0;

    let category = normalizeCategory(String(input.classification.category ?? ""));

    if (confidence < this.lowConfidenceThreshold) {
      category = DEFAULT_EMAIL_ROUTING_CATEGORY;
      return unresolvedDecision({
        category,
        confidence,
        reason: `Low classification confidence (${confidence.toFixed(2)} < ${this.lowConfidenceThreshold}); defaulting to ${CATEGORY_ROUTE_LABEL[category]} route (configuration still required)`,
      });
    }

    const resolved = this.options.targetResolver
      ? await this.options.targetResolver.resolveTarget({
          companyId: input.companyId,
          category,
        })
      : null;

    if (resolved?.targetId?.trim() && resolved.targetType !== "unresolved") {
      return {
        targetType: resolved.targetType,
        targetId: resolved.targetId.trim(),
        category,
        confidence,
        reason: `Routed ${CATEGORY_ROUTE_LABEL[category]} to configured ${resolved.targetType} target`,
        source: "classification",
        configurationRequired: false,
      };
    }

    return unresolvedDecision({
      category,
      confidence,
      reason: `Mapped to ${CATEGORY_ROUTE_LABEL[category]} route; no configured routing target (awaiting configuration)`,
    });
  }
}

export function createEmailRoutingEngine(
  options?: DefaultEmailRoutingEngineOptions,
): DefaultEmailRoutingEngine {
  return new DefaultEmailRoutingEngine(options);
}
