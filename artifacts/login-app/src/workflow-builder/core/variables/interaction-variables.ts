/**
 * Builder-facing metadata for interactive conversation runtime fields.
 * Internal tokens remain backward compatible with existing runtime variables.
 */
export const INTERACTION_VARIABLE_SUBGROUP = "last_interaction";

export const INTERACTION_RUNTIME_FIELDS = {
  lastSelectionId: "conversation.last_button_id",
  lastSelectionLabel: "conversation.last_button_title",
  lastSelectionType: "conversation.last_selection_type",
  lastUserMessage: "conversation.last_message",
  lastChannel: "conversation.channel",
  language: "conversation.language",
} as const;

export type InteractionRuntimeField =
  (typeof INTERACTION_RUNTIME_FIELDS)[keyof typeof INTERACTION_RUNTIME_FIELDS];

const INTERACTION_FIELD_SET = new Set<string>(Object.values(INTERACTION_RUNTIME_FIELDS));

/** Legacy aliases written by older workflows or docs. */
const LEGACY_INTERACTION_ID_FIELDS = new Set([
  INTERACTION_RUNTIME_FIELDS.lastSelectionId,
  "conversation.last_list_id",
]);

export function isInteractionSelectionIdField(field: string): boolean {
  const normalized = field.replace(/^\{\{|\}\}$/g, "").trim();
  return LEGACY_INTERACTION_ID_FIELDS.has(normalized);
}

export function isInteractionSelectionLabelField(field: string): boolean {
  const normalized = field.replace(/^\{\{|\}\}$/g, "").trim();
  return normalized === INTERACTION_RUNTIME_FIELDS.lastSelectionLabel;
}

export function isInteractionSelectionTypeField(field: string): boolean {
  const normalized = field.replace(/^\{\{|\}\}$/g, "").trim();
  return normalized === INTERACTION_RUNTIME_FIELDS.lastSelectionType;
}

export type InteractionValueSuggestionKind = "id" | "label" | "type";

export function getInteractionValueSuggestionKind(field: string): InteractionValueSuggestionKind | null {
  if (isInteractionSelectionIdField(field)) return "id";
  if (isInteractionSelectionLabelField(field)) return "label";
  if (isInteractionSelectionTypeField(field)) return "type";
  return null;
}

/** Runtime-facing interaction type tokens shown in condition value pickers. */
export const SUPPORTED_INTERACTION_TYPES = ["button", "list", "flow", "quick_reply"] as const;

export type SupportedInteractionType = (typeof SUPPORTED_INTERACTION_TYPES)[number];

export function isInteractionSelectionField(field: string): boolean {
  const normalized = field.replace(/^\{\{|\}\}$/g, "").trim();
  return INTERACTION_FIELD_SET.has(normalized) || normalized === "conversation.last_list_id";
}

export function resolveInteractionFieldLabel(field: string, fallbackLabel: (fieldPath: string) => string): string {
  const normalized = field.replace(/^\{\{|\}\}$/g, "").trim();
  switch (normalized) {
    case INTERACTION_RUNTIME_FIELDS.lastSelectionId:
    case "conversation.last_list_id":
      return fallbackLabel("last_button_id");
    case INTERACTION_RUNTIME_FIELDS.lastSelectionLabel:
      return fallbackLabel("last_button_title");
    case INTERACTION_RUNTIME_FIELDS.lastSelectionType:
      return fallbackLabel("last_selection_type");
    case INTERACTION_RUNTIME_FIELDS.lastUserMessage:
      return fallbackLabel("last_message");
    case INTERACTION_RUNTIME_FIELDS.lastChannel:
      return fallbackLabel("channel");
    default:
      return normalized;
  }
}

export function slugifyInteractionOptionId(label: string, fallback = "option"): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}
