import type {
  EntityWorkspaceLayoutDefinition,
  EntityWorkspaceModuleId,
  EntityWorkspacePanelDefinition,
  EntityWorkspaceTabId,
} from "./types";

const layouts = new Map<string, EntityWorkspaceLayoutDefinition>();

function layoutKey(moduleId: EntityWorkspaceModuleId, entityType?: string): string {
  return entityType ? `${moduleId}:${entityType}` : `${moduleId}:*`;
}

export function registerEntityWorkspaceLayout(layout: EntityWorkspaceLayoutDefinition): void {
  const types = layout.entityTypes?.length ? layout.entityTypes : ["*"];
  for (const entityType of types) {
    layouts.set(layoutKey(layout.moduleId, entityType === "*" ? undefined : entityType), layout);
  }
}

export function resolveEntityWorkspaceLayout(
  moduleId: EntityWorkspaceModuleId,
  entityType: string,
): EntityWorkspaceLayoutDefinition | null {
  return layouts.get(layoutKey(moduleId, entityType)) ?? layouts.get(layoutKey(moduleId)) ?? null;
}

export function listEntityWorkspaceLayouts(): EntityWorkspaceLayoutDefinition[] {
  const seen = new Set<EntityWorkspaceLayoutDefinition>();
  const out: EntityWorkspaceLayoutDefinition[] = [];
  for (const layout of layouts.values()) {
    if (seen.has(layout)) continue;
    seen.add(layout);
    out.push(layout);
  }
  return out;
}

export function layoutTabs(layout: EntityWorkspaceLayoutDefinition): EntityWorkspacePanelDefinition[] {
  return layout.panels
    .filter((panel) => panel.surface === "tab" && !panel.comingSoon)
    .slice()
    .sort((a, b) => a.order - b.order);
}

export function layoutWidgets(layout: EntityWorkspaceLayoutDefinition): EntityWorkspacePanelDefinition[] {
  return layout.panels
    .filter((panel) => panel.surface === "widget")
    .slice()
    .sort((a, b) => a.order - b.order);
}

/** Map URL / tab segment → panel id for navigation. */
export function normalizeEntityWorkspaceTab(
  tab: string | undefined,
  fallback: EntityWorkspaceTabId,
): EntityWorkspaceTabId {
  if (!tab || tab === "overview") return "overview";
  const allowed: EntityWorkspaceTabId[] = [
    "overview",
    "activity",
    "commerce",
    "communication",
    "files",
    "notes",
    "timeline",
    "tasks",
    "forms",
    "related",
    "ai",
    "history",
  ];
  if (allowed.includes(tab as EntityWorkspaceTabId)) return tab as EntityWorkspaceTabId;
  if (tab === "attachments") return "files";
  return fallback;
}

export function panelIdForTab(tab: EntityWorkspaceTabId): string {
  switch (tab) {
    case "activity":
    case "timeline":
      return "timeline";
    case "files":
      return "attachments";
    case "related":
      return "related-records";
    case "ai":
      return "ai-summary";
    default:
      return tab;
  }
}
