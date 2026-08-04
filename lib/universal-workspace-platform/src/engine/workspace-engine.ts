import type { Customer360SectionConfig } from "@workspace/universal-operations-engine";
import { OperationsRuntimeConfigurationError } from "@workspace/universal-operations-engine";
import type { WorkspaceDefinition, WorkspaceEntityType } from "../types/workspace-types.js";

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

function mapCustomer360SectionsToBlocks(sections: Customer360SectionConfig[]) {
  if (!sections.length) {
    throw new OperationsRuntimeConfigurationError(
      "configuration.customer360.sections is required — no runtime section fallback available",
    );
  }
  return sections.map((s) => ({
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

function mapGenericEntityBlocks(entityType: WorkspaceEntityType) {
  return [
    { id: "summary", type: "card" as const, labelKey: "blocks.summary", visible: true, collapsed: false, pinned: true, sortOrder: 0, roles: ["manager"], permissions: [] },
    { id: "timeline", type: "timeline" as const, labelKey: "blocks.timeline", visible: true, collapsed: false, pinned: false, sortOrder: 1, roles: ["manager"], permissions: [] },
    { id: "tasks", type: "tasks" as const, labelKey: "blocks.tasks", visible: true, collapsed: false, pinned: false, sortOrder: 2, roles: ["manager"], permissions: [] },
    { id: "files", type: "files" as const, labelKey: "blocks.files", visible: true, collapsed: false, pinned: false, sortOrder: 3, roles: ["manager"], permissions: [] },
    { id: "ai_card", type: "ai_card" as const, labelKey: "blocks.aiAssistant", visible: true, collapsed: false, pinned: false, sortOrder: 4, roles: ["manager"], permissions: [] },
  ];
}

export class WorkspaceEngine {
  resolve(
    entityType: WorkspaceEntityType,
    templateKey: string,
    customer360Sections?: Customer360SectionConfig[],
  ): WorkspaceDefinition {
    const blocks =
      entityType === "customer"
        ? mapCustomer360SectionsToBlocks(customer360Sections ?? [])
        : mapGenericEntityBlocks(entityType);

    return {
      id: `${entityType}_${templateKey}`,
      entityType,
      templateKey,
      labelKey: ENTITY_LABELS[entityType],
      icon: ENTITY_ICONS[entityType],
      blocks,
    };
  }

  listEntityTypes(): WorkspaceEntityType[] {
    return Object.keys(ENTITY_LABELS) as WorkspaceEntityType[];
  }
}

export const workspaceEngine = new WorkspaceEngine();
