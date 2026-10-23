/**
 * P1c helpers: observational evidence derivation + policy mode resolution.
 *
 * Compatibility strategy (explicit):
 * - `enforce` — evaluate P1a policy; persist qualification only for
 *   `qualified` / short-circuit `already_qualified`. Missing evidence is never
 *   treated as present.
 * - `human_override` — CRM/Kanban/Integration API human authority; skip policy
 *   evaluation (permissions still apply). Documented as intentional bypass.
 * - Default when mode omitted: `enforce` if `evidence` was supplied by the caller
 *   (including `{}`), otherwise `human_override` for legacy callers that never
 *   heard of the policy (pre-P1c AI/API/Kanban already pass modes explicitly).
 *
 * Company settings: resolved via P1b normalize/resolve. Persistence is NOT
 * provided here — callers may inject an in-memory store on LeadCommandService;
 * process restarts lose overrides unless a future migration adds storage.
 */

import type { LeadRecord } from "../types/lead-types.js";
import type { SalesEvidence } from "./lead-qualification-policy.js";

export type QualificationPolicyMode = "enforce" | "human_override";

export function resolveQualificationPolicyMode(input: {
  qualificationPolicyMode?: QualificationPolicyMode;
  /** True when the caller property `evidence` was present on the request object. */
  evidencePropertyProvided: boolean;
}): QualificationPolicyMode {
  if (input.qualificationPolicyMode === "enforce" || input.qualificationPolicyMode === "human_override") {
    return input.qualificationPolicyMode;
  }
  // Legacy: no mode and no evidence property → human_override (do not invent evidence).
  // If evidence property exists (even empty), enforce so missing fields stay missing.
  return input.evidencePropertyProvided ? "enforce" : "human_override";
}

/**
 * Facts observable on the lead row only. Never sets buying intent, need, budget,
 * authority, fit, or conflict from score/temperature/prompts.
 */
export function deriveObservationalSalesEvidence(lead: LeadRecord): SalesEvidence {
  const metadata =
    lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
      ? lead.metadata
      : {};
  const interest =
    metadata.productInterest && typeof metadata.productInterest === "object"
      ? (metadata.productInterest as Record<string, unknown>)
      : null;
  const productId = typeof interest?.productId === "string" ? interest.productId.trim() : "";

  return {
    contactAvailable: Boolean(
      (typeof lead.phone === "string" && lead.phone.trim()) ||
        (typeof lead.email === "string" && lead.email.trim()),
    ),
    productInterest: productId.length > 0,
    companyIdentified: Boolean(typeof lead.companyName === "string" && lead.companyName.trim()),
  };
}

/** Merge observational base with caller-supplied evidence; caller wins on conflicts. */
export function mergeSalesEvidence(base: SalesEvidence, override?: SalesEvidence | null): SalesEvidence {
  if (!override) return { ...base };
  return { ...base, ...override };
}
