export type ConversationListWindow = {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
};

export const OMNICHANNEL_LIST_ROW_HEIGHT = 112;
export const OMNICHANNEL_LIST_OVERSCAN = 8;

export function computeConversationListWindow(
  itemCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = OMNICHANNEL_LIST_ROW_HEIGHT,
  overscan = OMNICHANNEL_LIST_OVERSCAN,
): ConversationListWindow {
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
