import type { WorkspaceDensity, WorkspaceTheme } from "./workspace-types.js";

export type SavedFilter = {
  id: string;
  name: string;
  query: string;
  entityType?: string;
  createdAt: string;
};

export type ColumnPreset = {
  id: string;
  name: string;
  columnIds: string[];
};

export type SavedWorkspace = {
  id: string;
  name: string;
  templateKey: string;
  entityType: string;
  layoutBlockIds: string[];
};

export type WorkspacePersonalization = {
  userId: string;
  density: WorkspaceDensity;
  theme: WorkspaceTheme;
  favoriteBlockIds: string[];
  pinnedSectionIds: string[];
  collapsedSectionIds: string[];
  widgetOrder: string[];
  columnPresets: ColumnPreset[];
  savedFilters: SavedFilter[];
  savedWorkspaces: SavedWorkspace[];
  favoriteCardIds: string[];
};

export const DEFAULT_PERSONALIZATION: Omit<WorkspacePersonalization, "userId"> = {
  density: "comfortable",
  theme: "system",
  favoriteBlockIds: [],
  pinnedSectionIds: [],
  collapsedSectionIds: [],
  widgetOrder: [],
  columnPresets: [],
  savedFilters: [],
  savedWorkspaces: [],
  favoriteCardIds: [],
};
