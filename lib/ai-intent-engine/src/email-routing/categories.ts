/**
 * Canonical AI Email Routing categories (Sprint 1 classification core).
 * Downstream routing must consume these codes — do not invent ad-hoc labels.
 */
export const EMAIL_ROUTING_CATEGORIES = [
  "sales",
  "support",
  "billing",
  "complaint",
  "hr",
  "general_inquiry",
] as const;

export type EmailRoutingCategory = (typeof EMAIL_ROUTING_CATEGORIES)[number];

export const DEFAULT_EMAIL_ROUTING_CATEGORY: EmailRoutingCategory = "general_inquiry";

export const EMAIL_ROUTING_LOW_CONFIDENCE_THRESHOLD = 0.45;

export function isEmailRoutingCategory(value: string): value is EmailRoutingCategory {
  return (EMAIL_ROUTING_CATEGORIES as readonly string[]).includes(value);
}
