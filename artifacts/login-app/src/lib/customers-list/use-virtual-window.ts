import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";

type VirtualWindowOptions = {
  count: number;
  rowHeight: number;
  overscan?: number;
  scrollRef: RefObject<HTMLElement | null>;
};

export function useVirtualWindow({
  count,
  rowHeight,
  overscan = 10,
  scrollRef,
}: VirtualWindowOptions) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setViewportHeight(el.clientHeight);

    onResize();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [scrollRef, count, rowHeight]);

  return useMemo(() => {
    const totalHeight = count * rowHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const endIndex = Math.min(count, startIndex + visibleCount);

    return {
      startIndex,
      endIndex,
      totalHeight,
      paddingTop: startIndex * rowHeight,
      paddingBottom: Math.max(0, totalHeight - endIndex * rowHeight),
    };
  }, [count, rowHeight, overscan, scrollTop, viewportHeight]);
}
