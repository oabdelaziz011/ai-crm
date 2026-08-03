import type {
  EntityType,
  EntityContactType,
  EntityActivityType,
  EntityCustomFieldType,
} from "./entity-types.js";

export type EntityRef = Readonly<{
  tenantId: string;
  entityType: EntityType | string;
  entityId: string;
}>;

export type EntityContactReadModel = Readonly<{
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  contactType: EntityContactType | string;
  displayName: string;
  emails: readonly Readonly<{ value: string; label?: string; isPrimary?: boolean }>[];
  phones: readonly Readonly<{ value: string; label?: string; isPrimary?: boolean }>[];
  whatsapp: string | null;
  preferredLanguage: string | null;
  preferredChannel: string | null;
  notes: string | null;
  avatarUrl: string | null;
  status: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type EntityContactCreateInput = Readonly<{
  tenantId: string;
  entityType: string;
  entityId: string;
  contactType?: string;
  displayName: string;
  emails?: readonly Readonly<{ value: string; label?: string; isPrimary?: boolean }>[];
  phones?: readonly Readonly<{ value: string; label?: string; isPrimary?: boolean }>[];
  whatsapp?: string;
  preferredLanguage?: string;
  preferredChannel?: string;
  notes?: string;
  avatarUrl?: string;
  isPrimary?: boolean;
  actorUserId: string;
}>;

export type EntityContactUpdateInput = Readonly<{
  contactType?: string;
  displayName?: string;
  emails?: readonly Readonly<{ value: string; label?: string; isPrimary?: boolean }>[];
  phones?: readonly Readonly<{ value: string; label?: string; isPrimary?: boolean }>[];
  whatsapp?: string | null;
  preferredLanguage?: string | null;
  preferredChannel?: string | null;
  notes?: string | null;
  avatarUrl?: string | null;
  status?: string;
  isPrimary?: boolean;
  actorUserId: string;
}>;

export type EntityFileReadModel = Readonly<{
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string | null;
  storageProvider: string;
  storagePath: string;
  previewMetadata: Readonly<Record<string, unknown>>;
  version: number;
  uploadedAt: string;
  previewUrl: string | null;
}>;

export type EntityFileCreateInput = Readonly<{
  tenantId: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category?: string;
  storageProvider?: string;
  storagePath: string;
  previewMetadata?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  actorUserId: string;
}>;

export type EntityTagReadModel = Readonly<{
  id: string;
  tenantId: string;
  name: string;
  color: string | null;
  icon: string | null;
  category: string | null;
  description: string | null;
  isSystem: boolean;
}>;

export type EntityTagAssignmentReadModel = Readonly<{
  assignmentId: string;
  tag: EntityTagReadModel;
}>;

export type EntityTagCreateInput = Readonly<{
  tenantId: string;
  name: string;
  color?: string;
  icon?: string;
  category?: string;
  description?: string;
  isSystem?: boolean;
  actorUserId: string;
}>;

export type EntityCustomFieldDefinitionReadModel = Readonly<{
  id: string;
  tenantId: string;
  entityType: string;
  fieldKey: string;
  label: string;
  fieldType: EntityCustomFieldType | string;
  options: Readonly<Record<string, unknown>>;
  sortOrder: number;
}>;

export type EntityCustomFieldValueReadModel = Readonly<{
  fieldId: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  value: string;
  rawJson?: Readonly<Record<string, unknown>>;
}>;

export type EntityCustomFieldValueUpsertInput = Readonly<{
  tenantId: string;
  entityType: string;
  entityId: string;
  fieldId: string;
  valueText?: string | null;
  valueJson?: Record<string, unknown> | null;
  actorUserId: string;
}>;

export type EntityActivityReadModel = Readonly<{
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  activityType: EntityActivityType | string;
  subject: string;
  body: string | null;
  outcome: string | null;
  durationSeconds: number | null;
  actorId: string | null;
  actorName: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  attachments: readonly Readonly<Record<string, unknown>>[];
  occurredAt: string;
  channel: string;
  preview: string | null;
}>;

export type EntityActivityCreateInput = Readonly<{
  tenantId: string;
  entityType: string;
  entityId: string;
  activityType: string;
  subject: string;
  body?: string;
  outcome?: string;
  durationSeconds?: number;
  actorId?: string;
  actorName?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  attachments?: readonly Record<string, unknown>[];
  occurredAt?: string;
  actorUserId: string;
}>;

export type EntityListFilter = Readonly<{
  limit?: number;
  offset?: number;
  search?: string;
}>;

export type EntityContactReadPort = {
  list(tenantId: string, entityType: string, entityId: string, filter?: EntityListFilter): Promise<EntityContactReadModel[]>;
  search(tenantId: string, query: string, limit?: number): Promise<EntityContactReadModel[]>;
};

export type EntityContactWritePort = {
  create(input: EntityContactCreateInput): Promise<EntityContactReadModel>;
  update(tenantId: string, contactId: string, input: EntityContactUpdateInput): Promise<EntityContactReadModel>;
  archive(tenantId: string, contactId: string, actorUserId: string): Promise<void>;
};

export type EntityFileReadPort = {
  list(tenantId: string, entityType: string, entityId: string, filter?: EntityListFilter): Promise<EntityFileReadModel[]>;
  search(tenantId: string, query: string, limit?: number): Promise<EntityFileReadModel[]>;
};

export type EntityFileWritePort = {
  create(input: EntityFileCreateInput): Promise<EntityFileReadModel>;
  archive(tenantId: string, fileId: string, actorUserId: string): Promise<void>;
};

export type EntityTagReadPort = {
  listDefinitions(tenantId: string, filter?: EntityListFilter): Promise<EntityTagReadModel[]>;
  listForEntity(tenantId: string, entityType: string, entityId: string): Promise<EntityTagAssignmentReadModel[]>;
  search(tenantId: string, query: string, limit?: number): Promise<EntityTagReadModel[]>;
};

export type EntityTagWritePort = {
  createDefinition(input: EntityTagCreateInput): Promise<EntityTagReadModel>;
  assign(tenantId: string, entityType: string, entityId: string, tagId: string, actorUserId: string): Promise<void>;
  unassign(tenantId: string, entityType: string, entityId: string, tagId: string, actorUserId: string): Promise<void>;
};

export type EntityCustomFieldReadPort = {
  listDefinitions(tenantId: string, entityType: string): Promise<EntityCustomFieldDefinitionReadModel[]>;
  listValues(tenantId: string, entityType: string, entityId: string): Promise<EntityCustomFieldValueReadModel[]>;
  search(tenantId: string, query: string, limit?: number): Promise<EntityCustomFieldDefinitionReadModel[]>;
};

export type EntityCustomFieldWritePort = {
  upsertValue(input: EntityCustomFieldValueUpsertInput): Promise<EntityCustomFieldValueReadModel>;
};

export type EntityActivityReadPort = {
  list(tenantId: string, entityType: string, entityId: string, filter?: EntityListFilter): Promise<EntityActivityReadModel[]>;
  search(tenantId: string, query: string, limit?: number): Promise<EntityActivityReadModel[]>;
};

export type EntityActivityWritePort = {
  create(input: EntityActivityCreateInput): Promise<EntityActivityReadModel>;
};
