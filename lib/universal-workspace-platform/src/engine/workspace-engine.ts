import type { WorkspaceDefinition, WorkspaceEntityType } from "../types/workspace-types.js";
import { DEFAULT_CUSTOMER360_SECTIONS } from "@workspace/universal-operations-engine";

const ENTITY_LABELS: Record<WorkspaceEntityType, string> = {
  customer: "entities.customer",
  lead: "entities.lead",
  employee: "entities.employee",
  invoice: "entities.invoice",
  order: "entities.order",
  ticket: "entities.ticket",
  project: "entities.project",
  asset: "entities.asset",
  company: "entities.company",
  contract: "entities.contract",
};

const ENTITY_ICONS: Record<WorkspaceEntityType, string> = {
  customer: "User",
  lead: "UserPlus",
  employee: "BadgeCheck",
  invoice: "FileText",
  order: "ShoppingCart",
  ticket: "Ticket",
  project: "FolderKanban",
  asset: "Package",
  company: "Building2",
  contract: "FileSignature",
};

function mapSectionsToBlocks(entityType: WorkspaceEntityType) {
  if (entityType === "customer") {
    return DEFAULT_CUSTOMER360_SECTIONS.map((s) => ({
      id: s.id,
      type: "section" as const,
      labelKey: s.titleKey,
      visible: s.visible,
      collapsed: s.collapsed,
      pinned: false,
      sortOrder: s.sortOrder,
      roles: s.roles,
      permissions: s.permissions,
    }));
  }
  return [
    { id: "summary", type: "card" as const, labelKey: "blocks.summary", visible: true, collapsed: false, pinned: true, sortOrder: 0, roles: ["manager"], permissions: [] },
    { id: "timeline", type: "timeline" as const, labelKey: "blocks.timeline", visible: true, collapsed: false, pinned: false, sortOrder: 1, roles: ["manager"], permissions: [] },
    { id: "tasks", type: "tasks" as const, labelKey: "blocks.tasks", visible: true, collapsed: false, pinned: false, sortOrder: 2, roles: ["manager"], permissions: [] },
    { id: "files", type: "files" as const, labelKey: "blocks.files", visible: true, collapsed: false, pinned: false, sortOrder: 3, roles: ["manager"], permissions: [] },
    { id: "ai_card", type: "ai_card" as const, labelKey: "blocks.aiAssistant", visible: true, collapsed: false, pinned: false, sortOrder: 4, roles: ["manager"], permissions: [] },
  ];
}

export class WorkspaceEngine {
  resolve(entityType: WorkspaceEntityType, templateKey: string): WorkspaceDefinition {
    return {
      id: `${entityType}_${templateKey}`,
      entityType,
      templateKey,
      labelKey: ENTITY_LABELS[entityType],
      icon: ENTITY_ICONS[entityType],
      blocks: mapSectionsToBlocks(entityType),
    };
  }

  listEntityTypes(): WorkspaceEntityType[] {
    return Object.keys(ENTITY_LABELS) as WorkspaceEntityType[];
  }
}

export const workspaceEngine = new WorkspaceEngine();
