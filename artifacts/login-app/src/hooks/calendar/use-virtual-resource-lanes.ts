import { useCallback, useMemo, useRef, useState } from "react";
import type { TimelineResourceLaneLayout } from "@/lib/calendar/types/timeline-layout";

const VIRTUAL_OVERSCAN_PX = 240;

export function useVirtualResourceLanes(lanes: TimelineResourceLaneLayout[]) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);

  const laneOffsets = useMemo(() => {
    const offsets: number[] = [];
    let cursor = 0;
    for (const lane of lanes) {
      offsets.push(cursor);
      cursor += lane.laneHeightPx;
    }
    return offsets;
  }, [lanes]);

  const totalHeight = useMemo(
    () => lanes.reduce((sum, lane) => sum + lane.laneHeightPx, 0),
    [lanes],
  );

  const visibleRange = useMemo(() => {
    const startPx = Math.max(0, scrollTop - VIRTUAL_OVERSCAN_PX);
    const endPx = scrollTop + viewportHeight + VIRTUAL_OVERSCAN_PX;
    let startIndex = 0;
    let endIndex = lanes.length;

    for (let index = 0; index < lanes.length; index += 1) {
      const laneTop = laneOffsets[index];
      const laneBottom = laneTop + lanes[index].laneHeightPx;
      if (laneBottom <= startPx) {
        startIndex = index + 1;
      }
      if (laneTop >= endPx) {
        endIndex = index;
        break;
      }
    }

    return { startIndex, endIndex: Math.max(startIndex, endIndex) };
  }, [laneOffsets, lanes, scrollTop, viewportHeight]);

  const onScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    setScrollTop(node.scrollTop);
    setViewportHeight(node.clientHeight);
  }, []);

  const attachScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    if (node) {
      setViewportHeight(node.clientHeight);
    }
  }, []);

  const visibleLanes = useMemo(
    () => lanes.slice(visibleRange.startIndex, visibleRange.endIndex),
    [lanes, visibleRange.endIndex, visibleRange.startIndex],
  );

  const paddingTop = laneOffsets[visibleRange.startIndex] ?? 0;
  const paddingBottom = Math.max(
    0,
    totalHeight - paddingTop - visibleLanes.reduce((sum, lane) => sum + lane.laneHeightPx, 0),
  );

  return {
    attachScrollRef,
    onScroll,
    visibleLanes,
    visibleRange,
    paddingTop,
    paddingBottom,
    totalHeight,
  };
}
