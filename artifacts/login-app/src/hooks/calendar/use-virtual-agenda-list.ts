import { useCallback, useMemo, useRef, useState } from "react";
import type { AgendaDayGroup } from "@/hooks/calendar/use-agenda-groups";

const AGENDA_OVERSCAN_PX = 320;

export function useVirtualAgendaList(groups: AgendaDayGroup[]) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);

  const groupHeights = useMemo(
    () =>
      groups.map((group) => {
        const headerHeight = 44;
        if (group.isEmpty) return headerHeight + 36;
        return headerHeight + group.events.length * 72 + 8;
      }),
    [groups],
  );

  const groupOffsets = useMemo(() => {
    const offsets: number[] = [];
    let cursor = 0;
    for (const height of groupHeights) {
      offsets.push(cursor);
      cursor += height;
    }
    return offsets;
  }, [groupHeights]);

  const totalHeight = useMemo(
    () => groupHeights.reduce((sum, height) => sum + height, 0),
    [groupHeights],
  );

  const visibleRange = useMemo(() => {
    const startPx = Math.max(0, scrollTop - AGENDA_OVERSCAN_PX);
    const endPx = scrollTop + viewportHeight + AGENDA_OVERSCAN_PX;
    let startIndex = 0;
    let endIndex = groups.length;

    for (let index = 0; index < groups.length; index += 1) {
      const top = groupOffsets[index];
      const bottom = top + groupHeights[index];
      if (bottom <= startPx) startIndex = index + 1;
      if (top >= endPx) {
        endIndex = index;
        break;
      }
    }

    return { startIndex, endIndex: Math.max(startIndex, endIndex) };
  }, [groupHeights, groupOffsets, groups.length, scrollTop, viewportHeight]);

  const onScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    setScrollTop(node.scrollTop);
    setViewportHeight(node.clientHeight);
  }, []);

  const attachScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    if (node) setViewportHeight(node.clientHeight);
  }, []);

  const visibleGroups = useMemo(
    () => groups.slice(visibleRange.startIndex, visibleRange.endIndex),
    [groups, visibleRange.endIndex, visibleRange.startIndex],
  );

  const paddingTop = groupOffsets[visibleRange.startIndex] ?? 0;

  const visibleHeight = useMemo(() => {
    let height = 0;
    for (let index = visibleRange.startIndex; index < visibleRange.endIndex; index += 1) {
      height += groupHeights[index] ?? 0;
    }
    return height;
  }, [groupHeights, visibleRange.endIndex, visibleRange.startIndex]);

  const paddingBottom = Math.max(0, totalHeight - paddingTop - visibleHeight);

  return {
    attachScrollRef,
    onScroll,
    visibleGroups,
    visibleRange,
    paddingTop,
    paddingBottom,
    totalHeight,
  };
}
