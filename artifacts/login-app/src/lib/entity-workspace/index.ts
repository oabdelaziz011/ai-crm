import { registerDefaultEntityWorkspaceLayouts } from "./layouts/register-default-layouts";

registerDefaultEntityWorkspaceLayouts();

export type {
  EntityAttachment,
  EntityNote,
  EntityNoteAttachmentRef,
  EntityNoteCreateInput,
  EntityNoteFilterId,
  EntityNoteMention,
  EntityNoteVisibility,
  EntityTimelineEvent,
  EntityTimelineEventType,
  EntityWorkspaceLayoutDefinition,
  EntityWorkspaceModuleId,
  EntityWorkspacePanelDefinition,
  EntityWorkspacePanelId,
  EntityWorkspaceRef,
  EntityWorkspaceTabId,
} from "./types";

export {
  layoutTabs,
  layoutWidgets,
  listEntityWorkspaceLayouts,
  normalizeEntityWorkspaceTab,
  panelIdForTab,
  registerEntityWorkspaceLayout,
  resolveEntityWorkspaceLayout,
} from "./layout-registry";

export {
  entityWorkspaceDashboardHref,
  entityWorkspaceHref,
  operationsEntityWorkspaceHref,
  type EntityWorkspaceHrefInput,
} from "./href";

export { CRM_CUSTOMER_LAYOUT } from "./layouts/crm-customer-layout";
export {
  HR_ENTITY_LAYOUT,
  OPERATIONS_ENTITY_LAYOUT,
  SALES_ENTITY_LAYOUT,
  SUPPORT_ENTITY_LAYOUT,
} from "./layouts/operations-entity-layout";
export { registerDefaultEntityWorkspaceLayouts } from "./layouts/register-default-layouts";

export { createEntityNotesService, type EntityNotesService } from "./services/entity-notes-service";
export {
  createEntityAttachmentsService,
  type EntityAttachmentsService,
} from "./services/entity-attachments-service";
export {
  composeEntityTimeline,
  createEntityTimelineService,
  type EntityTimelineService,
} from "./services/entity-timeline-service";
