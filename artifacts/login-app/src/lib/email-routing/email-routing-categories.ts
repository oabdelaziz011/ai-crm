export const EMAIL_ROUTING_CATEGORIES = [
  "sales",
  "support",
  "billing",
  "complaint",
  "hr",
  "general_inquiry",
] as const;

export type EmailRoutingCategory = (typeof EMAIL_ROUTING_CATEGORIES)[number];

export function isEmailRoutingCategory(value: string): value is EmailRoutingCategory {
  return (EMAIL_ROUTING_CATEGORIES as readonly string[]).includes(value);
}
