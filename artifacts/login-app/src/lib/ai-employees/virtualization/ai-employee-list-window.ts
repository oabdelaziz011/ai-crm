export type AiEmployeeListWindow = {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
};

export const AI_EMPLOYEE_LIST_ROW_HEIGHT = 72;
export const AI_EMPLOYEE_LIST_OVERSCAN = 6;

export function computeAiEmployeeListWindow(
  itemCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = AI_EMPLOYEE_LIST_ROW_HEIGHT,
  overscan = AI_EMPLOYEE_LIST_OVERSCAN,
): AiEmployeeListWindow {
  if (itemCount <= 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
  }

  const totalHeight = itemCount * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const endIndex = Math.min(itemCount, startIndex + visibleCount);

  return {
    startIndex,
    endIndex,
    offsetY: startIndex * rowHeight,
    totalHeight,
  };
}
