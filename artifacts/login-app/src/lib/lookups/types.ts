export const LOOKUP_ENTITY_IDS = [
  "services",
  "resources",
  "customers",
  "staff",
  "branches",
  "rooms",
  "tags",
  "available_slots",
  "available_dates",
  "recommended_appointments",
] as const;

export type LookupEntityId = (typeof LOOKUP_ENTITY_IDS)[number];

export type ListDataSourceMode = "manual" | "lookup";

export type ListLookupFilters = Record<string, string | boolean | number | null | undefined>;

export type ListLookupConfig = {
  lookup: LookupEntityId;
  displayField: string;
  valueField: string;
  filters?: ListLookupFilters;
};

export type LookupOutputFieldType = "string" | "number" | "boolean" | "id";

export type LookupOutputFieldDefinition = {
  id: string;
  labelKey: string;
  type: LookupOutputFieldType;
};

export type LookupFieldDefinition = {
  id: string;
  labelKey: string;
};

export type LookupFilterDefinition = {
  id: string;
  labelKey: string;
  type: "text" | "select" | "boolean";
  options?: Array<{ value: string; labelKey: string }>;
};

export type LookupEntityDefinition = {
  id: LookupEntityId;
  labelKey: string;
  variableName: string;
  displayNameKey: string;
  defaultDisplayField: string;
  defaultValueField: string;
  displayFields: LookupFieldDefinition[];
  valueFields: LookupFieldDefinition[];
  outputFields: LookupOutputFieldDefinition[];
  filters: LookupFilterDefinition[];
  /** Computed lookups derive options at runtime (e.g. available slots). */
  computed?: boolean;
  /** Required filter/context keys for computed lookups. */
  requiredContext?: string[];
};

export type LookupOptionRow = {
  id: string;
  title: string;
  description?: string;
  value?: string;
  record?: Record<string, unknown>;
};
