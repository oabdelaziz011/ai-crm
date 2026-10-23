/**
 * Deterministic sales evidence from stored conversation text.
 * Model-supplied booleans are not an input. Matched phrases are not returned.
 */
import type { SalesEvidence } from "./lead-qualification-policy.js";

const BUYING_INTENT =
  /\b(i want to buy|i'd like to buy|i would like to buy|ready to buy|want to purchase|want to order|send me a quote|request a quote|please send (?:me )?a quote|ich möchte kaufen|möchte kaufen|will kaufen|bitte ein angebot|angebot schicken)\b|(?<!nicht )(?<!nicht\s)\b(?:buy|purchase|kaufen)\b|عايز(?:ة|ين)?\s*(?:أشتري|اشتري)|هشتري|أشتري|اشتري|نشتري|عرض\s*سعر|ا?بعت(?:لي|وا)?\s*عرض/iu;

const STATED_NEED = /\b(i need|we need|looking for|ich brauche|wir brauchen)\b|محتاج|نحتاج|عايز(?:ين)?\s*(?:نظام|حل)/iu;

const PRODUCT_INTEREST = /\b(products?|produkt|produkte)\b|منتج|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/iu;

const BUDGET = /\b(budget|budgetrahmen)\b|ميزانية|\b\d[\d,]*\s*(?:egp|usd|eur|euro|جنيه)\b/iu;

const NOT_A_FIT = /\b(not interested|no thanks|kein interesse|nicht interessiert)\b|مش مهتم|لا أريد|مش عايز/iu;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const PHONE = /(?:\+|00)?\d[\d\s\-()]{7,}\d/;

const AUDIT_BOOLEAN_KEYS = [
  "productInterest",
  "statedNeed",
  "explicitBuyingIntent",
  "contactAvailable",
  "companyIdentified",
  "businessUseCase",
  "purchaseTiming",
  "budgetKnown",
  "decisionAuthorityKnown",
  "notAFit",
  "conflictingSignals",
] as const;

export function extractSalesEvidenceFromConversation(texts: readonly string[]): SalesEvidence {
  const corpus = texts
    .filter((text) => typeof text === "string")
    .map((text) => text.slice(0, 500))
    .join("\n");
  if (!corpus.trim()) return {};

  const explicitBuyingIntent = BUYING_INTENT.test(corpus);
  const notAFit = NOT_A_FIT.test(corpus);
  const evidence: SalesEvidence = {};
  if (PRODUCT_INTEREST.test(corpus)) evidence.productInterest = true;
  if (STATED_NEED.test(corpus)) evidence.statedNeed = true;
  if (explicitBuyingIntent) evidence.explicitBuyingIntent = true;
  if (EMAIL.test(corpus) || PHONE.test(corpus)) evidence.contactAvailable = true;
  if (BUDGET.test(corpus)) evidence.budgetKnown = true;
  if (notAFit) evidence.notAFit = true;
  if (explicitBuyingIntent && notAFit) evidence.conflictingSignals = true;
  return evidence;
}

/** Booleans only. Never includes message text or free-form next steps. */
export function salesEvidenceAuditSnapshot(evidence: SalesEvidence): Record<string, boolean> {
  const snapshot: Record<string, boolean> = {};
  for (const key of AUDIT_BOOLEAN_KEYS) {
    const value = evidence[key];
    if (typeof value === "boolean") snapshot[key] = value;
  }
  return snapshot;
}
