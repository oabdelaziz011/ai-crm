import type { DecisionConfidencePolicy, DecisionOutcome } from "./types.js";

export type DecisionResultValue = {
  label: string;
  labels: string[];
  confidence: number;
  score: number | null;
  metadata: Record<string, unknown>;
};

export type DecisionValidationResult = {
  valid: boolean;
  value: DecisionResultValue;
  errors: string[];
  warnings: string[];
  usedFallback: boolean;
  requiresHumanReview: boolean;
};

function clampConfidence(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeLabel(value: unknown): string {
  return String(value ?? "").trim();
}

function findOutcomeByLabel(outcomes: DecisionOutcome[], label: string): DecisionOutcome | undefined {
  const normalized = label.toLowerCase().trim();
  if (!normalized) return undefined;

  const exact =
    outcomes.find((outcome) => outcome.label.toLowerCase() === normalized) ??
    outcomes.find((outcome) => outcome.id.toLowerCase() === normalized);
  if (exact) return exact;

  // Match configured examples (exact) — e.g. "كام السعر" → pricing
  for (const outcome of outcomes) {
    for (const example of outcome.examples ?? []) {
      if (String(example).toLowerCase().trim() === normalized) {
        return outcome;
      }
    }
  }

  // Soft contains against label / id / examples / description for phrases like "اسعار وتكلفة"
  for (const outcome of outcomes) {
    const needles = [
      outcome.label,
      outcome.id,
      ...(outcome.examples ?? []),
      outcome.description ?? "",
    ]
      .map((value) => String(value).toLowerCase().trim())
      .filter((value) => value.length >= 3);

    if (needles.some((needle) => normalized.includes(needle) || needle.includes(normalized))) {
      return outcome;
    }
  }

  return undefined;
}

function resolveFallbackOutcome(
  outcomes: DecisionOutcome[],
  fallbackOutcomeId: string | null,
): DecisionOutcome | undefined {
  if (!fallbackOutcomeId) return undefined;
  return outcomes.find((outcome) => outcome.id === fallbackOutcomeId);
}

function readModelPayload(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { label: raw };
    }
  }
  return {};
}

export function validateDecisionResult(
  outcomes: DecisionOutcome[],
  confidencePolicy: DecisionConfidencePolicy,
  confidenceThreshold: number | null,
  raw: unknown,
): DecisionValidationResult {
  const payload = readModelPayload(raw);
  const errors: string[] = [];
  const warnings: string[] = [];
  let usedFallback = false;
  let requiresHumanReview = confidencePolicy.requireHumanReview;

  const rawLabel = normalizeLabel(payload.label ?? payload.decision ?? payload.category);
  const rawLabels = Array.isArray(payload.labels)
    ? payload.labels.map(normalizeLabel).filter(Boolean)
    : rawLabel
      ? [rawLabel]
      : [];

  let matched = rawLabel ? findOutcomeByLabel(outcomes, rawLabel) : undefined;
  if (!matched && rawLabels.length) {
    matched = findOutcomeByLabel(outcomes, rawLabels[0] ?? "");
  }

  const policyFallback = resolveFallbackOutcome(outcomes, confidencePolicy.fallbackOutcomeId);

  if (!matched) {
    const fallback =
      policyFallback ??
      resolveFallbackOutcome(outcomes, null) ??
      outcomes[0];
    if (fallback) {
      matched = fallback;
      usedFallback = true;
      warnings.push(`Model returned unknown label "${rawLabel || "unknown"}". Applied fallback outcome "${fallback.label}".`);
    } else if (outcomes.length === 0) {
      matched = { id: "score-only", label: rawLabel || "unknown" };
    } else {
      errors.push(`Returned label "${rawLabel || "unknown"}" is not an allowed decision outcome.`);
      matched = outcomes[0];
      usedFallback = true;
    }
  }

  const rawConfidence = payload.confidence ?? payload.score;
  const confidenceProvided =
    rawConfidence != null &&
    !(typeof rawConfidence === "string" && rawConfidence.trim() === "");
  // Missing confidence must not be treated as 0 — that incorrectly forces the
  // low-confidence fallback (e.g. Other → "وضح طلبك") for valid labels.
  const confidence = confidenceProvided ? clampConfidence(rawConfidence) : 1;
  const score =
    typeof payload.score === "number"
      ? payload.score
      : typeof payload.score === "string" && Number.isFinite(Number(payload.score))
        ? Number(payload.score)
        : null;

  const minimum =
    confidencePolicy.minimumConfidence ??
    confidenceThreshold ??
    null;

  if (confidenceProvided && minimum != null && confidence < minimum) {
    const message = `Confidence ${confidence.toFixed(2)} is below threshold ${minimum.toFixed(2)}.`;
    if (confidencePolicy.emitWarning) warnings.push(message);
    if (confidencePolicy.requireHumanReview) requiresHumanReview = true;
    if (policyFallback && matched?.id !== policyFallback.id) {
      matched = policyFallback;
      usedFallback = true;
      warnings.push(`Applied confidence policy fallback outcome "${policyFallback.label}".`);
    }
  }

  const labels = rawLabels.length
    ? rawLabels.filter((label) => Boolean(findOutcomeByLabel(outcomes, label)))
    : matched
      ? [matched.label]
      : [];

  const metadata =
    payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : {};

  if (typeof payload.reasoning === "string" && payload.reasoning.trim()) {
    metadata.reasoning = payload.reasoning.trim();
  }
  if (usedFallback) metadata.usedFallback = true;
  if (requiresHumanReview) metadata.requiresHumanReview = true;
  if (warnings.length) metadata.warnings = warnings;

  return {
    valid: errors.length === 0,
    value: {
      label: matched?.label ?? rawLabel ?? "unknown",
      labels,
      confidence,
      score,
      metadata,
    },
    errors,
    warnings,
    usedFallback,
    requiresHumanReview,
  };
}
