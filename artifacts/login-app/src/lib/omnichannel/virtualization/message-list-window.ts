export type MessageListWindow = {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
};

export const OMNICHANNEL_MESSAGE_ROW_HEIGHT = 72;
export const OMNICHANNEL_MESSAGE_OVERSCAN = 12;

export function computeMessageListWindow(
  itemCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = OMNICHANNEL_MESSAGE_ROW_HEIGHT,
  overscan = OMNICHANNEL_MESSAGE_OVERSCAN,
): MessageListWindow {
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

export function computeVariableListWindow(
  rowHeights: number[],
  scrollTop: number,
  viewportHeight: number,
  overscan = OMNICHANNEL_MESSAGE_OVERSCAN,
): MessageListWindow {
  if (rowHeights.length === 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
  }

  const offsets: number[] = [];
  let totalHeight = 0;
  for (const height of rowHeights) {
    offsets.push(totalHeight);
    totalHeight += height;
  }

  let startIndex = 0;
  while (startIndex < rowHeights.length - 1 && offsets[startIndex + 1]! <= scrollTop) {
    startIndex += 1;
  }
  startIndex = Math.max(0, startIndex - overscan);

  const endTarget = scrollTop + viewportHeight;
  let endIndex = startIndex;
  while (endIndex < rowHeights.length && offsets[endIndex]! < endTarget) {
    endIndex += 1;
  }
  endIndex = Math.min(rowHeights.length, endIndex + overscan);

  return {
    startIndex,
    endIndex,
    offsetY: offsets[startIndex] ?? 0,
    totalHeight,
  };
}
