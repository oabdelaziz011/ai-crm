export type VirtualWindow = {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
  visibleCount: number;
};

export const OPERATIONS_TIMELINE_ROW_HEIGHT = 72;
export const OPERATIONS_TIMELINE_OVERSCAN = 6;

/** Lightweight windowing for high-volume timeline rendering. */
export function computeVirtualWindow(
  itemCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = OPERATIONS_TIMELINE_ROW_HEIGHT,
  overscan = OPERATIONS_TIMELINE_OVERSCAN,
): VirtualWindow {
  if (itemCount <= 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0, visibleCount: 0 };
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
    visibleCount: endIndex - startIndex,
  };
}

export function stickyTimeLabelForSlot(startTime: string, prevStartTime?: string): boolean {
  if (!prevStartTime) return true;
  const [h] = startTime.split(":");
  const [ph] = prevStartTime.split(":");
  return h !== ph;
}
