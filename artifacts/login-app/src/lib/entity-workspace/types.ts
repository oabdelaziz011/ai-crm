/**
 * Enterprise Entity Workspace Engine — module-agnostic types.
 * Same entity + backend; layouts differ by opening module.
 */

export type EntityWorkspaceModuleId =
  | "crm"
  | "operations"
  | "support"
  | "hr"
  | "sales";

/** Canonical panel ids — layouts pick a subset and order. */
export type EntityWorkspacePanelId =
  | "overview"
  | "current-operation"
  | "operation-status"
  | "assigned-resource"
  | "notes"
  | "attachments"
  | "timeline"
  | "activities"
  | "communication"
  | "bookings"
  | "invoices"
  | "payments"
  | "tasks"
  | "forms"
  | "related-records"
  | "tags"
  | "custom-fields"
  | "lead-score"
  | "deals"
  | "campaigns"
  | "customer-value"
  | "ai-summary"
  | "history";

export type EntityWorkspaceTabId =
  | "overview"
  | "activity"
  | "commerce"
  | "communication"
  | "files"
  | "notes"
  | "timeline"
  | "tasks"
  | "forms"
  | "related"
  | "ai"
  | "history";

export type EntityWorkspaceRef = Readonly<{
  entityType: string;
  entityId: string;
  /** Optional operation / booking / work-item context when opened from Operations. */
  operationId?: string | null;
}>;

export type EntityWorkspacePanelDefinition = Readonly<{
  id: EntityWorkspacePanelId;
  titleKey: string;
  /** Hide CRM-only or Ops-only widgets per layout. */
  modules?: readonly EntityWorkspaceModuleId[];
  order: number;
  /** When true, panel is a primary tab; otherwise a widget on overview. */
  surface: "tab" | "widget";
  comingSoon?: boolean;
}>;

export type EntityWorkspaceLayoutDefinition = Readonly<{
  moduleId: EntityWorkspaceModuleId;
  /** Optional entity-type filter; omit = all types. */
  entityTypes?: readonly string[];
  titleKey: string;
  panels: readonly EntityWorkspacePanelDefinition[];
  defaultTab: EntityWorkspaceTabId;
  /** Hide sales/CRM widgets when true. */
  hideCrmSalesWidgets: boolean;
  /** Prefer operational status chrome. */
  showOperationContext: boolean;
}>;

/** UX visibility: Operations / CRM / Both. Legacy values mapped at read time. */
export type EntityNoteVisibility = "operations" | "crm" | "both" | "internal" | "shared" | "restricted";

export type EntityNoteAttachmentRef = Readonly<{
  id: string;
  fileName: string;
  fileType: string;
  preview: string | null;
  sizeBytes: number;
  uploadedAt: string;
}>;

/** Stored for render + future notification dispatch. */
export type EntityNoteMention = Readonly<{
  userId: string;
  handle: string;
  label: string;
  targetType: "agent" | "team";
}>;

export type EntityNote = Readonly<{
  id: string;
  entityId: string;
  entityType: string;
  operationId: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdByRole: string | null;
  department: string | null;
  visibility: EntityNoteVisibility;
  category: string | null;
  title: string | null;
  text: string;
  sourceModule: EntityWorkspaceModuleId | string | null;
  pinned: boolean;
  mentions: readonly EntityNoteMention[];
  attachments: readonly EntityNoteAttachmentRef[];
  createdAt: string;
  updatedAt: string;
}>;

export type EntityNoteFilterId =
  | "all"
  | "mine"
  | "pinned"
  | "attachments"
  | "today"
  | "week";

export type EntityNoteCreateInput = Readonly<{
  tenantId: string;
  entityType: string;
  entityId: string;
  text: string;
  title?: string | null;
  operationId?: string | null;
  /** When set, overrides default related_entity_type inference from operationId. */
  relatedEntityType?: string | null;
  /** When set, overrides default related_entity_id (defaults to operationId for bookings). */
  relatedEntityId?: string | null;
  createdBy: string;
  createdByName?: string | null;
  createdByRole?: string | null;
  department?: string | null;
  visibility?: EntityNoteVisibility;
  category?: string | null;
  sourceModule: EntityWorkspaceModuleId | string;
  pinned?: boolean;
  mentions?: readonly EntityNoteMention[];
  /** Browser File objects uploaded after the note activity is created. */
  files?: readonly File[];
  /** Pre-uploaded storage objects (legacy / recovery path only). */
  uploadedFiles?: readonly {
    storagePath: string;
    mimeType: string;
    fileName: string;
    sizeBytes: number;
  }[];
  /** Real Storage upload progress while saving (no UI logic in the service). */
  onUploadProgress?: (event: {
    fileName: string;
    percent: number;
    fileIndex: number;
    fileCount: number;
  }) => void;
}>;

export type EntityAttachment = Readonly<{
  id: string;
  entityId: string;
  entityType: string;
  activityId: string | null;
  operationId: string | null;
  category: string | null;
  fileType: string;
  fileName: string;
  uploadedBy: string | null;
  uploadedByRole: string | null;
  uploadedAt: string;
  storagePath: string;
  preview: string | null;
  sizeBytes: number;
  sourceModule: EntityWorkspaceModuleId | string | null;
}>;

export type EntityTimelineEventType =
  | "note_added"
  | "attachment_uploaded"
  | "operation_created"
  | "operation_updated"
  | "booking_created"
  | "booking_completed"
  | "invoice_created"
  | "payment_collected"
  | "communication_sent"
  | "task_completed"
  | "status_changed"
  | "activity";

export type EntityTimelineEvent = Readonly<{
  id: string;
  entityId: string;
  entityType: string;
  eventType: EntityTimelineEventType;
  title: string;
  description: string | null;
  actor: string | null;
  /** Profile / auth user id for EmployeeIdentityService. */
  actorId?: string | null;
  role: string | null;
  department: string | null;
  timestamp: string;
  sourceModule: EntityWorkspaceModuleId | string | null;
  operationId: string | null;
  /** When set, UI can open the related note in the Notes tab. */
  noteId?: string | null;
  attachmentCount?: number;
  /** Present only when the activity payload includes a before/after change. */
  oldValue?: string | null;
  newValue?: string | null;
}>;
