import type { WorkspaceBlockType } from "./workspace-types.js";

export type DesignerPaletteItem = {
  id: string;
  type: WorkspaceBlockType;
  labelKey: string;
  icon: string;
  defaultSize: "sm" | "md" | "lg";
};

export type DesignerCanvasBlock = {
  id: string;
  paletteItemId: string;
  type: WorkspaceBlockType;
  labelKey: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type WorkspaceDesignerState = {
  id: string;
  name: string;
  templateKey: string;
  canvasBlocks: DesignerCanvasBlock[];
  updatedAt: string;
};
