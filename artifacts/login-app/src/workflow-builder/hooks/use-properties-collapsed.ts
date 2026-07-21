import { usePersistedCollapsed } from "./use-persisted-collapsed";

const STORAGE_KEY = "workflow-builder-ui:properties-collapsed";

export const PROPERTIES_WIDTH_PX = 320;

export function usePropertiesCollapsed() {
  return usePersistedCollapsed(STORAGE_KEY);
}
