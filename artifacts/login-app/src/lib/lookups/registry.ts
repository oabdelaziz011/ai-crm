import type { LookupEntityDefinition, LookupEntityId, LookupOutputFieldDefinition } from "./types";

const field = (id: string, labelKey: string) => ({ id, labelKey });
const outputField = (
  id: string,
  labelKey: string,
  type: LookupOutputFieldDefinition["type"] = "string",
): LookupOutputFieldDefinition => ({ id, labelKey, type });

export const LOOKUP_ENTITY_REGISTRY: LookupEntityDefinition[] = [
  {
    id: "services",
    labelKey: "lookups.entities.services",
    variableName: "selected_service",
    displayNameKey: "lookups.outputVariables.selectedService",
    defaultDisplayField: "name",
    defaultValueField: "id",
    displayFields: [field("name", "lookups.fields.name"), field("description", "lookups.fields.description")],
    valueFields: [field("id", "lookups.fields.id")],
    outputFields: [
      outputField("id", "lookups.fields.id", "id"),
      outputField("name", "lookups.fields.name"),
      outputField("description", "lookups.fields.description"),
      outputField("duration_minutes", "lookups.fields.durationMinutes", "number"),
      outputField("status", "lookups.fields.status"),
    ],
    filters: [
      {
        id: "status",
        labelKey: "lookups.filters.status",
        type: "select",
        options: [
          { value: "active", labelKey: "lookups.filters.active" },
          { value: "inactive", labelKey: "lookups.filters.inactive" },
        ],
      },
    ],
  },
  {
    id: "resources",
    labelKey: "lookups.entities.resources",
    variableName: "selected_resource",
    displayNameKey: "lookups.outputVariables.selectedResource",
    defaultDisplayField: "name",
    defaultValueField: "id",
    displayFields: [field("name", "lookups.fields.name"), field("resource_type", "lookups.fields.resourceType")],
    valueFields: [field("id", "lookups.fields.id")],
    outputFields: [
      outputField("id", "lookups.fields.id", "id"),
      outputField("name", "lookups.fields.name"),
      outputField("resource_type", "lookups.fields.resourceType"),
      outputField("branch_id", "lookups.fields.branchId", "id"),
      outputField("status", "lookups.fields.status"),
    ],
    filters: [
      {
        id: "status",
        labelKey: "lookups.filters.status",
        type: "select",
        options: [
          { value: "active", labelKey: "lookups.filters.active" },
          { value: "inactive", labelKey: "lookups.filters.inactive" },
        ],
      },
      {
        id: "branch_id",
        labelKey: "lookups.filters.branch",
        type: "text",
      },
      {
        id: "resource_type",
        labelKey: "lookups.filters.resourceType",
        type: "select",
        options: [
          { value: "doctor", labelKey: "lookups.resourceTypes.doctor" },
          { value: "employee", labelKey: "lookups.resourceTypes.employee" },
          { value: "therapist", labelKey: "lookups.resourceTypes.therapist" },
          { value: "room", labelKey: "lookups.resourceTypes.room" },
          { value: "chair", labelKey: "lookups.resourceTypes.chair" },
          { value: "equipment", labelKey: "lookups.resourceTypes.equipment" },
        ],
      },
      {
        id: "service_id",
        labelKey: "lookups.filters.service",
        type: "text",
      },
    ],
  },
  {
    id: "customers",
    labelKey: "lookups.entities.customers",
    variableName: "selected_customer",
    displayNameKey: "lookups.outputVariables.selectedCustomer",
    defaultDisplayField: "name",
    defaultValueField: "id",
    displayFields: [
      field("name", "lookups.fields.name"),
      field("email", "lookups.fields.email"),
      field("phone", "lookups.fields.phone"),
    ],
    valueFields: [field("id", "lookups.fields.id"), field("email", "lookups.fields.email")],
    outputFields: [
      outputField("id", "lookups.fields.id", "id"),
      outputField("name", "lookups.fields.name"),
      outputField("email", "lookups.fields.email"),
      outputField("phone", "lookups.fields.phone"),
    ],
    filters: [],
  },
  {
    id: "staff",
    labelKey: "lookups.entities.staff",
    variableName: "selected_staff",
    displayNameKey: "lookups.outputVariables.selectedStaff",
    defaultDisplayField: "name",
    defaultValueField: "id",
    displayFields: [
      field("name", "lookups.fields.name"),
      field("full_name", "lookups.fields.fullName"),
      field("email", "lookups.fields.email"),
    ],
    valueFields: [field("id", "lookups.fields.id"), field("email", "lookups.fields.email")],
    outputFields: [
      outputField("id", "lookups.fields.id", "id"),
      outputField("name", "lookups.fields.name"),
      outputField("full_name", "lookups.fields.fullName"),
      outputField("email", "lookups.fields.email"),
      outputField("resource_type", "lookups.fields.resourceType"),
    ],
    filters: [
      {
        id: "resource_type",
        labelKey: "lookups.filters.resourceType",
        type: "select",
        options: [
          { value: "doctor", labelKey: "lookups.resourceTypes.doctor" },
          { value: "employee", labelKey: "lookups.resourceTypes.employee" },
          { value: "therapist", labelKey: "lookups.resourceTypes.therapist" },
        ],
      },
    ],
  },
  {
    id: "branches",
    labelKey: "lookups.entities.branches",
    variableName: "selected_branch",
    displayNameKey: "lookups.outputVariables.selectedBranch",
    defaultDisplayField: "name",
    defaultValueField: "id",
    displayFields: [field("name", "lookups.fields.name"), field("code", "lookups.fields.code")],
    valueFields: [field("id", "lookups.fields.id"), field("code", "lookups.fields.code")],
    outputFields: [
      outputField("id", "lookups.fields.id", "id"),
      outputField("name", "lookups.fields.name"),
      outputField("code", "lookups.fields.code"),
      outputField("status", "lookups.fields.status"),
    ],
    filters: [
      {
        id: "status",
        labelKey: "lookups.filters.status",
        type: "select",
        options: [
          { value: "active", labelKey: "lookups.filters.active" },
          { value: "inactive", labelKey: "lookups.filters.inactive" },
        ],
      },
    ],
  },
  {
    id: "rooms",
    labelKey: "lookups.entities.rooms",
    variableName: "selected_room",
    displayNameKey: "lookups.outputVariables.selectedRoom",
    defaultDisplayField: "name",
    defaultValueField: "id",
    displayFields: [field("name", "lookups.fields.name")],
    valueFields: [field("id", "lookups.fields.id")],
    outputFields: [
      outputField("id", "lookups.fields.id", "id"),
      outputField("name", "lookups.fields.name"),
      outputField("branch_id", "lookups.fields.branchId", "id"),
      outputField("status", "lookups.fields.status"),
    ],
    filters: [
      {
        id: "branch_id",
        labelKey: "lookups.filters.branch",
        type: "text",
      },
    ],
  },
  {
    id: "tags",
    labelKey: "lookups.entities.tags",
    variableName: "selected_tag",
    displayNameKey: "lookups.outputVariables.selectedTag",
    defaultDisplayField: "name",
    defaultValueField: "name",
    displayFields: [field("name", "lookups.fields.name")],
    valueFields: [field("name", "lookups.fields.name")],
    outputFields: [outputField("name", "lookups.fields.name")],
    filters: [],
  },
  {
    id: "recommended_appointments",
    labelKey: "lookups.entities.recommendedAppointments",
    variableName: "selected_recommendation",
    displayNameKey: "lookups.outputVariables.selectedRecommendation",
    defaultDisplayField: "display_label",
    defaultValueField: "slot_key",
    computed: true,
    requiredContext: ["service_id"],
    displayFields: [
      field("display_label", "lookups.fields.displayLabel"),
      field("resourceName", "lookups.fields.resourceName"),
      field("branchName", "lookups.fields.branchName"),
      field("date", "lookups.fields.date"),
      field("displayTime", "lookups.fields.displayTime"),
      field("score", "lookups.fields.score"),
      field("reason", "lookups.fields.reason"),
    ],
    valueFields: [
      field("slot_key", "lookups.fields.slotKey"),
      field("resourceId", "lookups.fields.resourceId"),
      field("date", "lookups.fields.date"),
      field("start", "lookups.fields.startTime"),
    ],
    outputFields: [
      outputField("resourceId", "lookups.fields.resourceId", "id"),
      outputField("resourceName", "lookups.fields.resourceName"),
      outputField("branchId", "lookups.fields.branchId", "id"),
      outputField("branchName", "lookups.fields.branchName"),
      outputField("date", "lookups.fields.date"),
      outputField("start", "lookups.fields.startTime"),
      outputField("end", "lookups.fields.endTime"),
      outputField("displayTime", "lookups.fields.displayTime"),
      outputField("score", "lookups.fields.score", "number"),
      outputField("reason", "lookups.fields.reason"),
      outputField("timezone", "lookups.fields.timezone"),
    ],
    filters: [
      { id: "service_id", labelKey: "lookups.filters.service", type: "text" },
      { id: "resource_id", labelKey: "lookups.filters.resource", type: "text" },
      { id: "branch_id", labelKey: "lookups.filters.branch", type: "text" },
      { id: "preferred_date", labelKey: "lookups.filters.date", type: "text" },
      { id: "preferred_time", labelKey: "lookups.filters.time", type: "text" },
      {
        id: "days_ahead",
        labelKey: "lookups.filters.daysAhead",
        type: "select",
        options: [
          { value: "7", labelKey: "lookups.filters.daysAhead7" },
          { value: "14", labelKey: "lookups.filters.daysAhead14" },
          { value: "30", labelKey: "lookups.filters.daysAhead30" },
          { value: "60", labelKey: "lookups.filters.daysAhead60" },
          { value: "90", labelKey: "lookups.filters.daysAhead90" },
        ],
      },
    ],
  },
  {
    id: "available_dates",
    labelKey: "lookups.entities.availableDates",
    variableName: "selected_date",
    displayNameKey: "lookups.outputVariables.selectedDate",
    defaultDisplayField: "display_date",
    defaultValueField: "date",
    computed: true,
    requiredContext: ["service_id", "resource_id"],
    displayFields: [
      field("display_date", "lookups.fields.displayDate"),
      field("date", "lookups.fields.date"),
    ],
    valueFields: [
      field("date", "lookups.fields.date"),
      field("display_date", "lookups.fields.displayDate"),
    ],
    outputFields: [
      outputField("date", "lookups.fields.date"),
      outputField("display_date", "lookups.fields.displayDate"),
      outputField("service_id", "lookups.fields.serviceId", "id"),
      outputField("resource_id", "lookups.fields.resourceId", "id"),
      outputField("timezone", "lookups.fields.timezone"),
    ],
    filters: [
      { id: "service_id", labelKey: "lookups.filters.service", type: "text" },
      { id: "resource_id", labelKey: "lookups.filters.resource", type: "text" },
      {
        id: "days_ahead",
        labelKey: "lookups.filters.daysAhead",
        type: "select",
        options: [
          { value: "7", labelKey: "lookups.filters.daysAhead7" },
          { value: "14", labelKey: "lookups.filters.daysAhead14" },
          { value: "30", labelKey: "lookups.filters.daysAhead30" },
          { value: "60", labelKey: "lookups.filters.daysAhead60" },
          { value: "90", labelKey: "lookups.filters.daysAhead90" },
        ],
      },
    ],
  },
  {
    id: "available_slots",
    labelKey: "lookups.entities.availableSlots",
    variableName: "selected_slot",
    displayNameKey: "lookups.outputVariables.selectedSlot",
    defaultDisplayField: "display_time",
    defaultValueField: "start_at",
    computed: true,
    requiredContext: ["service_id", "resource_id", "date"],
    displayFields: [
      field("display_time", "lookups.fields.displayTime"),
      field("start_at", "lookups.fields.startAt"),
    ],
    valueFields: [
      field("start_at", "lookups.fields.startAt"),
      field("display_time", "lookups.fields.displayTime"),
    ],
    outputFields: [
      outputField("start_at", "lookups.fields.startAt"),
      outputField("end_at", "lookups.fields.endAt"),
      outputField("display_time", "lookups.fields.displayTime"),
      outputField("duration_minutes", "lookups.fields.durationMinutes", "number"),
      outputField("service_id", "lookups.fields.serviceId", "id"),
      outputField("resource_id", "lookups.fields.resourceId", "id"),
      outputField("branch_id", "lookups.fields.branchId", "id"),
      outputField("timezone", "lookups.fields.timezone"),
    ],
    filters: [
      { id: "service_id", labelKey: "lookups.filters.service", type: "text" },
      { id: "resource_id", labelKey: "lookups.filters.resource", type: "text" },
      { id: "date", labelKey: "lookups.filters.date", type: "text" },
    ],
  },
];

const registryById = new Map<LookupEntityId, LookupEntityDefinition>(
  LOOKUP_ENTITY_REGISTRY.map((entry) => [entry.id, entry]),
);

export function getLookupEntityDefinitions(): LookupEntityDefinition[] {
  return LOOKUP_ENTITY_REGISTRY;
}

export function getLookupEntityDefinition(id: LookupEntityId): LookupEntityDefinition {
  const definition = registryById.get(id);
  if (!definition) {
    throw new Error(`Unknown lookup entity: ${id}`);
  }
  return definition;
}

export function isLookupEntityId(value: unknown): value is LookupEntityId {
  return typeof value === "string" && registryById.has(value as LookupEntityId);
}
