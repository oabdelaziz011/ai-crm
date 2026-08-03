import type { DesignerPaletteItem, WorkspaceDesignerState } from "../types/designer-types.js";
import { DESIGNER_PALETTE, DEFAULT_DESIGNER_STATE } from "../mock/mock-designer.js";

export class DesignerEngine {
  getPalette(): DesignerPaletteItem[] {
    return DESIGNER_PALETTE;
  }

  createState(name: string, templateKey: string): WorkspaceDesignerState {
    return {
      id: `design_${Date.now()}`,
      name,
      templateKey,
      canvasBlocks: [],
      updatedAt: new Date().toISOString(),
    };
  }

  addBlock(state: WorkspaceDesignerState, paletteItem: DesignerPaletteItem): WorkspaceDesignerState {
    const block = {
      id: `block_${Date.now()}`,
      paletteItemId: paletteItem.id,
      type: paletteItem.type,
      labelKey: paletteItem.labelKey,
      x: 0,
      y: state.canvasBlocks.length,
      w: paletteItem.defaultSize === "lg" ? 12 : paletteItem.defaultSize === "md" ? 8 : 4,
      h: paletteItem.defaultSize === "lg" ? 3 : 2,
    };
    return {
      ...state,
      canvasBlocks: [...state.canvasBlocks, block],
      updatedAt: new Date().toISOString(),
    };
  }

  removeBlock(state: WorkspaceDesignerState, blockId: string): WorkspaceDesignerState {
    return {
      ...state,
      canvasBlocks: state.canvasBlocks.filter((b) => b.id !== blockId),
      updatedAt: new Date().toISOString(),
    };
  }

  reorderBlocks(state: WorkspaceDesignerState, blockIds: string[]): WorkspaceDesignerState {
    const map = new Map(state.canvasBlocks.map((b) => [b.id, b]));
    const reordered = blockIds.map((id, i) => {
      const block = map.get(id);
      return block ? { ...block, y: i } : null;
    }).filter(Boolean) as WorkspaceDesignerState["canvasBlocks"];
    return { ...state, canvasBlocks: reordered, updatedAt: new Date().toISOString() };
  }
}

export const designerEngine = new DesignerEngine();
