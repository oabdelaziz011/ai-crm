import { useMemo, useState, type UIEvent } from "react";

const DEFAULT_ITEM_HEIGHT = 148;
const OVERSCAN = 4;

/** Lightweight column virtualization without extra dependencies. */
export function useKanbanVirtualColumn<T>(items: readonly T[], itemHeight = DEFAULT_ITEM_HEIGHT) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
    setViewportHeight(event.currentTarget.clientHeight);
  };

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - OVERSCAN);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / itemHeight) + OVERSCAN,
  );

  const visibleItems = useMemo(
    () =>
      items.slice(startIndex, endIndex).map((item, offset) => ({
        item,
        index: startIndex + offset,
        offsetTop: (startIndex + offset) * itemHeight,
      })),
    [endIndex, itemHeight, items, startIndex],
  );

  return {
    totalHeight,
    visibleItems,
    onScroll,
    shouldVirtualize: items.length > 24,
  };
}
