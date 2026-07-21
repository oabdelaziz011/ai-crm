import { usePersistedCollapsed } from "./use-persisted-collapsed";

const STORAGE_KEY = "workflow-builder-ui:palette-collapsed";

export const PALETTE_WIDTH_PX = 280;

export function usePaletteCollapsed() {
  return usePersistedCollapsed(STORAGE_KEY);
}
