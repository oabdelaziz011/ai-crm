export const KNOWLEDGE_SOURCE_TYPES = [
  "manual",
  "faq",
  "policy",
  "pdf",
  "website",
  "database",
  "crm",
  "api",
  "notion",
  "confluence",
  "google_drive",
  "sharepoint",
  "custom",
] as const;

export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

export const DOCUMENT_STATUSES = ["draft", "published", "archived"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const VERSION_STATUSES = ["draft", "published", "archived"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const KNOWLEDGE_PERMISSIONS = {
  view: "knowledge.view",
  manage: "knowledge.manage",
  publish: "knowledge.publish",
  import: "knowledge.import",
} as const;

export const KNOWLEDGE_AUDIT_EVENTS = [
  "source_created",
  "source_archived",
  "document_imported",
  "document_updated",
  "document_published",
  "document_archived",
  "version_created",
  "chunk_generated",
  "knowledge_source_created",
  "knowledge_source_archived",
] as const;

export type KnowledgeAuditEvent = (typeof KNOWLEDGE_AUDIT_EVENTS)[number];

export const DEFAULT_CHUNK_SIZE = 800;
export const DEFAULT_CHUNK_OVERLAP = 100;

export const DEFAULT_CLASSIFICATION = "internal";
export const DEFAULT_VISIBILITY = "company";
