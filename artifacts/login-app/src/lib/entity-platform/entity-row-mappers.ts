import type {
  EntityContactReadModel,
  EntityFileReadModel,
  EntityTagReadModel,
  EntityTagAssignmentReadModel,
  EntityCustomFieldDefinitionReadModel,
  EntityCustomFieldValueReadModel,
  EntityActivityReadModel,
} from "@workspace/application-layer";

export function mapActivityTypeToChannel(activityType: string): string {
  const normalized = activityType.toLowerCase();
  if (normalized.includes("whatsapp")) return "WhatsApp";
  if (normalized.includes("email")) return "Email";
  if (normalized.includes("sms")) return "SMS";
  if (normalized.includes("call")) return "Phone";
  if (normalized.includes("meeting")) return "Meeting";
  if (normalized.includes("manual_note") || normalized.includes("note")) return "Internal Notes";
  if (normalized.includes("task")) return "Task";
  if (normalized.includes("payment")) return "Payment";
  if (normalized.includes("invoice")) return "Invoice";
  if (normalized.includes("booking")) return "Booking";
  if (normalized.includes("ai")) return "AI";
  if (normalized.includes("workflow")) return "Workflow";
  return activityType;
}

type ContactRow = {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  contact_type: string;
  display_name: string;
  emails: unknown;
  phones: unknown;
  whatsapp: string | null;
  preferred_language: string | null;
  preferred_channel: string | null;
  notes: string | null;
  avatar_url: string | null;
  status: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

type FileRow = {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  category: string | null;
  storage_provider: string;
  storage_path: string;
  preview_metadata: unknown;
  version: number;
  created_at: string;
};

type TagRow = {
  id: string;
  tenant_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  category: string | null;
  description: string | null;
  is_system: boolean;
};

type TagAssignmentRow = {
  id: string;
  tag_id: string;
  entity_tags: TagRow | TagRow[] | null;
};

type CustomFieldRow = {
  id: string;
  tenant_id: string;
  entity_type: string;
  field_key: string;
  label: string;
  field_type: string;
  options: unknown;
  sort_order: number;
};

type CustomFieldValueRow = {
  field_id: string;
  value_text: string | null;
  value_json: unknown;
  entity_custom_fields: CustomFieldRow | CustomFieldRow[] | null;
};

type ActivityRow = {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  activity_type: string;
  subject: string;
  body: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  actor_id: string | null;
  actor_name: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  attachments: unknown;
  occurred_at: string;
};

function parseJsonArray<T>(value: unknown): readonly T[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value as T[]);
}

function unwrapJoin<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapContactRow(row: ContactRow): EntityContactReadModel {
  return Object.freeze({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    contactType: String(row.contact_type),
    displayName: String(row.display_name),
    emails: parseJsonArray<{ value: string; label?: string; isPrimary?: boolean }>(row.emails),
    phones: parseJsonArray<{ value: string; label?: string; isPrimary?: boolean }>(row.phones),
    whatsapp: row.whatsapp ? String(row.whatsapp) : null,
    preferredLanguage: row.preferred_language ? String(row.preferred_language) : null,
    preferredChannel: row.preferred_channel ? String(row.preferred_channel) : null,
    notes: row.notes ? String(row.notes) : null,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    status: String(row.status),
    isPrimary: Boolean(row.is_primary),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  });
}

export function mapFileRow(row: FileRow, previewUrl: string | null = null): EntityFileReadModel {
  const previewMetadata =
    row.preview_metadata && typeof row.preview_metadata === "object"
      ? Object.freeze({ ...(row.preview_metadata as Record<string, unknown>) })
      : Object.freeze({});

  return Object.freeze({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes ?? 0),
    category: row.category ? String(row.category) : null,
    storageProvider: String(row.storage_provider),
    storagePath: String(row.storage_path),
    previewMetadata,
    version: Number(row.version ?? 1),
    uploadedAt: String(row.created_at),
    previewUrl,
  });
}

export function mapTagRow(row: TagRow): EntityTagReadModel {
  return Object.freeze({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    color: row.color ? String(row.color) : null,
    icon: row.icon ? String(row.icon) : null,
    category: row.category ? String(row.category) : null,
    description: row.description ? String(row.description) : null,
    isSystem: Boolean(row.is_system),
  });
}

export function mapTagAssignmentRow(row: TagAssignmentRow): EntityTagAssignmentReadModel | null {
  const tagRow = unwrapJoin(row.entity_tags);
  if (!tagRow) return null;
  return Object.freeze({
    assignmentId: String(row.id),
    tag: mapTagRow(tagRow),
  });
}

export function mapCustomFieldDefinitionRow(row: CustomFieldRow): EntityCustomFieldDefinitionReadModel {
  const options =
    row.options && typeof row.options === "object"
      ? Object.freeze({ ...(row.options as Record<string, unknown>) })
      : Object.freeze({});

  return Object.freeze({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    entityType: String(row.entity_type),
    fieldKey: String(row.field_key),
    label: String(row.label),
    fieldType: String(row.field_type),
    options,
    sortOrder: Number(row.sort_order ?? 0),
  });
}

export function mapCustomFieldValueRow(row: CustomFieldValueRow): EntityCustomFieldValueReadModel | null {
  const field = unwrapJoin(row.entity_custom_fields);
  if (!field) return null;

  const value =
    row.value_text ??
    (row.value_json != null ? JSON.stringify(row.value_json) : "");

  return Object.freeze({
    fieldId: String(row.field_id),
    fieldKey: String(field.field_key),
    label: String(field.label),
    fieldType: String(field.field_type),
    value: String(value),
    rawJson:
      row.value_json && typeof row.value_json === "object"
        ? Object.freeze({ ...(row.value_json as Record<string, unknown>) })
        : undefined,
  });
}

export function mapActivityRow(row: ActivityRow): EntityActivityReadModel {
  const attachments = parseJsonArray<Record<string, unknown>>(row.attachments);
  const activityType = String(row.activity_type);

  return Object.freeze({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    activityType,
    subject: String(row.subject),
    body: row.body ? String(row.body) : null,
    outcome: row.outcome ? String(row.outcome) : null,
    durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    actorId: row.actor_id ? String(row.actor_id) : null,
    actorName: row.actor_name ? String(row.actor_name) : null,
    relatedEntityType: row.related_entity_type ? String(row.related_entity_type) : null,
    relatedEntityId: row.related_entity_id ? String(row.related_entity_id) : null,
    attachments,
    occurredAt: String(row.occurred_at),
    channel: mapActivityTypeToChannel(activityType),
    preview: row.body ? String(row.body).slice(0, 240) : null,
  });
}

export type {
  ContactRow,
  FileRow,
  TagRow,
  TagAssignmentRow,
  CustomFieldRow,
  CustomFieldValueRow,
  ActivityRow,
};
