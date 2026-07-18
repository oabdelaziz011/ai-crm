export const SEEDED_INTENT_KEYS = [
  "greeting",
  "faq",
  "booking_request",
  "appointment_lookup",
  "customer_lookup",
  "crm_lookup",
  "knowledge_lookup",
  "escalation_request",
  "notification_request",
  "fallback",
] as const;

export type SeededIntentKey = (typeof SEEDED_INTENT_KEYS)[number];

export const INTENT_MATCH_STATUSES = ["matched", "rejected", "fallback", "escalated"] as const;

export type IntentMatchStatus = (typeof INTENT_MATCH_STATUSES)[number];

export const CLASSIFIER_KEYS = ["rule_based", "keyword", "llm", "composite"] as const;

export type ClassifierKey = (typeof CLASSIFIER_KEYS)[number];

export const INTENT_PERMISSIONS = {
  view: "intents.view",
  manage: "intents.manage",
} as const;

export const INTENT_AUDIT_EVENTS = [
  "intent_matched",
  "intent_rejected",
  "intent_fallback",
  "intent_escalated",
  "classifier_selected",
  "intent_enabled",
  "intent_disabled",
] as const;

export type IntentAuditEvent = (typeof INTENT_AUDIT_EVENTS)[number];

export const FALLBACK_INTENT_KEY = "fallback";
