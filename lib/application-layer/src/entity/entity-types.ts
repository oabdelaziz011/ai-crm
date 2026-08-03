/** Universal entity type codes — registry-backed, never hardcode literals in business logic. */
export const ENTITY_TYPES = [
  "customer",
  "lead",
  "company",
  "employee",
  "supplier",
  "project",
  "asset",
  "booking",
  "invoice",
  "ticket",
  "knowledge",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}

export const ENTITY_CONTACT_TYPES = [
  "primary",
  "billing",
  "technical",
  "emergency",
  "decision_maker",
  "assistant",
  "other",
] as const;

export type EntityContactType = (typeof ENTITY_CONTACT_TYPES)[number];

export const ENTITY_ACTIVITY_TYPES = [
  "call",
  "meeting",
  "booking",
  "invoice",
  "payment",
  "email",
  "whatsapp",
  "sms",
  "task",
  "workflow",
  "ai",
  "manual_note",
  "timeline",
] as const;

export type EntityActivityType = (typeof ENTITY_ACTIVITY_TYPES)[number];

export const ENTITY_CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "currency",
  "boolean",
  "date",
  "datetime",
  "dropdown",
  "multi_select",
  "lookup",
  "formula",
  "json",
] as const;

export type EntityCustomFieldType = (typeof ENTITY_CUSTOM_FIELD_TYPES)[number];
