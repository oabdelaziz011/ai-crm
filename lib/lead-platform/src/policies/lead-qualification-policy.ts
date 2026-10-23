/**
 * Deterministic lead qualification policy (P1a foundation).
 *
 * Evaluates observed sales evidence against company-configurable requirements.
 * Does not persist CRM state, call qualifyLead, or schedule follow-up.
 *
 * Buying intent and product interest are evidence — not lifecycle statuses.
 * Score and temperature are never treated as proof of buying intent.
 */

/** Configurable evidence keys that may be required by a company policy. */
export const SALES_EVIDENCE_FIELD_KEYS = [
  "productInterest",
  "statedNeed",
  "explicitBuyingIntent",
  "intendedNextStep",
  "contactAvailable",
  "companyIdentified",
  "businessUseCase",
  "purchaseTiming",
  /** Optional by default for both B2B and B2C — require only when configured. */
  "budgetKnown",
  "decisionAuthorityKnown",
] as const;

export type SalesEvidenceFieldKey = (typeof SALES_EVIDENCE_FIELD_KEYS)[number];

export type SalesMotion = "b2b" | "b2c" | "mixed";

/**
 * Only facts actually provided or reliably observed.
 * Absent / unknown fields must remain unset or false — never fabricated.
 */
export type SalesEvidence = {
  /** Catalog or stated product/service interest (e.g. metadata.productInterest). */
  productInterest?: boolean;
  /** Stated business or personal need / outcome. */
  statedNeed?: boolean;
  /**
   * Explicit purchase / quote / buy language — not inferred from browsing,
   * price questions alone, score, or temperature.
   */
  explicitBuyingIntent?: boolean;
  /** Customer-stated next step when known (quote, purchase, sales_contact, …). */
  intendedNextStep?: string | null;
  /** Usable phone and/or email on the lead or conversation identity. */
  contactAvailable?: boolean;
  /** Company / org name or identifier known. */
  companyIdentified?: boolean;
  /** Business use-case / fit articulated (B2B-oriented). */
  businessUseCase?: boolean;
  /** Purchase timing known when relevant. */
  purchaseTiming?: boolean;
  /** Budget constraint or amount known — optional unless configured. */
  budgetKnown?: boolean;
  /** Decision-maker / authority known — optional unless configured. */
  decisionAuthorityKnown?: boolean;
  /**
   * Customer or agent evidence that the offering is not a fit.
   * Required for `not_a_fit`; never inferred from missing fields alone.
   */
  notAFit?: boolean;
  /** Contradictory signals that block autonomous qualification. */
  conflictingSignals?: boolean;
};

export type LeadQualificationPolicyConfig = {
  salesMotion: SalesMotion;
  /**
   * Evidence fields that must be present (true / non-empty) before `qualified`.
   * Empty array is allowed but unusual — defaults always populate a sensible set.
   */
  requiredEvidenceFields: readonly SalesEvidenceFieldKey[];
  /** When true, incomplete required evidence yields `requires_human_review` instead of `needs_more_information`. */
  requireHumanReviewWhenIncomplete: boolean;
  /** When true (default), conflicting signals yield `requires_human_review`. */
  requireHumanReviewOnConflict: boolean;
};

export type LeadQualificationOutcome =
  | "qualified"
  | "already_qualified"
  | "interested_not_qualified"
  | "needs_more_information"
  | "not_a_fit"
  | "requires_human_review"
  | "operation_failed";

/** Minimal lead snapshot for policy evaluation (no DB access). */
export type LeadQualificationSnapshot = {
  isQualified: boolean;
  /** Informational only — not used as a qualification criterion. */
  score?: number | null;
  /** Informational only — not used as proof of buying intent. */
  temperature?: string | null;
  lifecycleStatus?: string | null;
};

export type LeadQualificationEvaluation = {
  outcome: LeadQualificationOutcome;
  /** Stable, machine-readable reason code. */
  reason: string;
  /** Human-readable explanation for logs / tooling. */
  explanation: string;
  missingRequiredEvidence: SalesEvidenceFieldKey[];
  requiresHumanReview: boolean;
  salesMotion: SalesMotion;
  /** Echo of resolved config required fields (for deterministic tests / audit). */
  requiredEvidenceFields: SalesEvidenceFieldKey[];
};

export type EvaluateLeadQualificationInput = {
  evidence: SalesEvidence;
  lead: LeadQualificationSnapshot;
  /** Partial overrides merged onto motion defaults. */
  config?: Partial<LeadQualificationPolicyConfig> & { salesMotion?: SalesMotion };
};

/** B2C: interest alone never qualifies; need explicit intent + contact + interest. */
export const DEFAULT_B2C_REQUIRED_EVIDENCE: readonly SalesEvidenceFieldKey[] = [
  "productInterest",
  "explicitBuyingIntent",
  "contactAvailable",
];

/** B2B: stated need + contact; budget/authority stay optional unless configured. */
export const DEFAULT_B2B_REQUIRED_EVIDENCE: readonly SalesEvidenceFieldKey[] = [
  "statedNeed",
  "contactAvailable",
  "explicitBuyingIntent",
];

/**
 * Mixed: union of B2C and B2B minimums — never silently skip a configured requirement.
 * Companies should override `requiredEvidenceFields` for tighter control.
 */
export const DEFAULT_MIXED_REQUIRED_EVIDENCE: readonly SalesEvidenceFieldKey[] = [
  "productInterest",
  "statedNeed",
  "explicitBuyingIntent",
  "contactAvailable",
];

export function defaultRequiredEvidenceForMotion(motion: SalesMotion): readonly SalesEvidenceFieldKey[] {
  switch (motion) {
    case "b2c":
      return DEFAULT_B2C_REQUIRED_EVIDENCE;
    case "b2b":
      return DEFAULT_B2B_REQUIRED_EVIDENCE;
    case "mixed":
      return DEFAULT_MIXED_REQUIRED_EVIDENCE;
    default: {
      const _exhaustive: never = motion;
      return _exhaustive;
    }
  }
}

export function resolveLeadQualificationPolicyConfig(
  input?: Partial<LeadQualificationPolicyConfig> & { salesMotion?: SalesMotion },
): LeadQualificationPolicyConfig {
  const salesMotion: SalesMotion =
    input?.salesMotion === "b2b" || input?.salesMotion === "b2c" || input?.salesMotion === "mixed"
      ? input.salesMotion
      : "b2c";

  const fromInput = Array.isArray(input?.requiredEvidenceFields)
    ? input!.requiredEvidenceFields.filter((key): key is SalesEvidenceFieldKey =>
        (SALES_EVIDENCE_FIELD_KEYS as readonly string[]).includes(key),
      )
    : null;

  const requiredEvidenceFields = Object.freeze(
    [...(fromInput ?? defaultRequiredEvidenceForMotion(salesMotion))],
  ) as readonly SalesEvidenceFieldKey[];

  return {
    salesMotion,
    requiredEvidenceFields,
    requireHumanReviewWhenIncomplete: input?.requireHumanReviewWhenIncomplete === true,
    requireHumanReviewOnConflict: input?.requireHumanReviewOnConflict !== false,
  };
}

function isEvidenceFieldSatisfied(evidence: SalesEvidence, key: SalesEvidenceFieldKey): boolean {
  switch (key) {
    case "productInterest":
      return evidence.productInterest === true;
    case "statedNeed":
      return evidence.statedNeed === true;
    case "explicitBuyingIntent":
      return evidence.explicitBuyingIntent === true;
    case "intendedNextStep":
      return typeof evidence.intendedNextStep === "string" && evidence.intendedNextStep.trim().length > 0;
    case "contactAvailable":
      return evidence.contactAvailable === true;
    case "companyIdentified":
      return evidence.companyIdentified === true;
    case "businessUseCase":
      return evidence.businessUseCase === true;
    case "purchaseTiming":
      return evidence.purchaseTiming === true;
    case "budgetKnown":
      return evidence.budgetKnown === true;
    case "decisionAuthorityKnown":
      return evidence.decisionAuthorityKnown === true;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

function listMissingRequired(
  evidence: SalesEvidence,
  required: readonly SalesEvidenceFieldKey[],
): SalesEvidenceFieldKey[] {
  const missing: SalesEvidenceFieldKey[] = [];
  for (const key of required) {
    if (!isEvidenceFieldSatisfied(evidence, key)) missing.push(key);
  }
  // Deterministic order matching SALES_EVIDENCE_FIELD_KEYS.
  const order = new Map(SALES_EVIDENCE_FIELD_KEYS.map((k, i) => [k, i]));
  return missing.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

function evaluation(
  partial: Omit<LeadQualificationEvaluation, "salesMotion" | "requiredEvidenceFields"> & {
    salesMotion: SalesMotion;
    requiredEvidenceFields: readonly SalesEvidenceFieldKey[];
  },
): LeadQualificationEvaluation {
  return {
    outcome: partial.outcome,
    reason: partial.reason,
    explanation: partial.explanation,
    missingRequiredEvidence: [...partial.missingRequiredEvidence],
    requiresHumanReview: partial.requiresHumanReview,
    salesMotion: partial.salesMotion,
    requiredEvidenceFields: [...partial.requiredEvidenceFields],
  };
}

/**
 * Pure policy evaluation. Safe to call repeatedly; does not mutate lead state.
 */
export function evaluateLeadQualificationPolicy(
  input: EvaluateLeadQualificationInput,
): LeadQualificationEvaluation {
  if (!input || typeof input !== "object" || !input.lead || typeof input.lead !== "object") {
    return evaluation({
      outcome: "operation_failed",
      reason: "invalid_input",
      explanation: "Lead snapshot is required for qualification policy evaluation.",
      missingRequiredEvidence: [],
      requiresHumanReview: false,
      salesMotion: "b2c",
      requiredEvidenceFields: defaultRequiredEvidenceForMotion("b2c"),
    });
  }

  if (!input.evidence || typeof input.evidence !== "object") {
    return evaluation({
      outcome: "operation_failed",
      reason: "invalid_evidence",
      explanation: "Sales evidence object is required; missing evidence must not be fabricated.",
      missingRequiredEvidence: [],
      requiresHumanReview: false,
      salesMotion: "b2c",
      requiredEvidenceFields: defaultRequiredEvidenceForMotion("b2c"),
    });
  }

  const config = resolveLeadQualificationPolicyConfig(input.config);
  const evidence = input.evidence;
  const missing = listMissingRequired(evidence, config.requiredEvidenceFields);

  if (input.lead.isQualified === true) {
    return evaluation({
      outcome: "already_qualified",
      reason: "lead_already_qualified",
      explanation: "Lead is already marked qualified; policy returns an idempotent already_qualified outcome.",
      missingRequiredEvidence: [],
      requiresHumanReview: false,
      salesMotion: config.salesMotion,
      requiredEvidenceFields: config.requiredEvidenceFields,
    });
  }

  if (evidence.notAFit === true) {
    return evaluation({
      outcome: "not_a_fit",
      reason: "explicit_not_a_fit",
      explanation: "Evidence explicitly indicates the lead is not a fit for the offering.",
      missingRequiredEvidence: [],
      requiresHumanReview: false,
      salesMotion: config.salesMotion,
      requiredEvidenceFields: config.requiredEvidenceFields,
    });
  }

  if (evidence.conflictingSignals === true && config.requireHumanReviewOnConflict) {
    return evaluation({
      outcome: "requires_human_review",
      reason: "conflicting_signals",
      explanation: "Conflicting customer signals block autonomous qualification; human review is required.",
      missingRequiredEvidence: missing,
      requiresHumanReview: true,
      salesMotion: config.salesMotion,
      requiredEvidenceFields: config.requiredEvidenceFields,
    });
  }

  // Interest without qualification path: product interest but no explicit buying intent.
  const hasInterest = evidence.productInterest === true || evidence.statedNeed === true;
  const hasBuyingIntent = evidence.explicitBuyingIntent === true;

  if (hasInterest && !hasBuyingIntent) {
    return evaluation({
      outcome: "interested_not_qualified",
      reason: "interest_without_buying_intent",
      explanation:
        "Product/service interest or stated need is present, but explicit buying intent is not. " +
        "Score and temperature are ignored as buying-intent proof.",
      missingRequiredEvidence: missing,
      requiresHumanReview: false,
      salesMotion: config.salesMotion,
      requiredEvidenceFields: config.requiredEvidenceFields,
    });
  }

  if (missing.length > 0) {
    if (config.requireHumanReviewWhenIncomplete) {
      return evaluation({
        outcome: "requires_human_review",
        reason: "incomplete_evidence_human_review",
        explanation: `Required evidence missing: ${missing.join(", ")}. Configuration requires human review.`,
        missingRequiredEvidence: missing,
        requiresHumanReview: true,
        salesMotion: config.salesMotion,
        requiredEvidenceFields: config.requiredEvidenceFields,
      });
    }
    return evaluation({
      outcome: "needs_more_information",
      reason: "incomplete_required_evidence",
      explanation: `Required evidence missing: ${missing.join(", ")}. Do not fabricate missing fields.`,
      missingRequiredEvidence: missing,
      requiresHumanReview: false,
      salesMotion: config.salesMotion,
      requiredEvidenceFields: config.requiredEvidenceFields,
    });
  }

  // All configured required fields satisfied — including explicitBuyingIntent when in the list.
  return evaluation({
    outcome: "qualified",
    reason: "policy_requirements_met",
    explanation: `All required evidence fields are satisfied for salesMotion=${config.salesMotion}.`,
    missingRequiredEvidence: [],
    requiresHumanReview: false,
    salesMotion: config.salesMotion,
    requiredEvidenceFields: config.requiredEvidenceFields,
  });
}
