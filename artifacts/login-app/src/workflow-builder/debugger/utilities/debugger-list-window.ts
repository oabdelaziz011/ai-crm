export const DEBUGGER_LIST_VIRTUAL_THRESHOLD = 48;
export const DEBUGGER_VARIABLE_ROW_HEIGHT = 88;
export const DEBUGGER_CALL_STACK_ROW_HEIGHT = 96;
export const DEBUGGER_TIMELINE_ROW_HEIGHT = 112;
export const DEBUGGER_LIST_OVERSCAN = 8;

export type DebuggerListWindow = {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
  totalHeight: number;
  shouldVirtualize: boolean;
};

export function computeDebuggerListWindow(input: {
  count: number;
  rowHeight: number;
  scrollTop?: number;
  viewportHeight?: number;
  overscan?: number;
  threshold?: number;
}): DebuggerListWindow {
  const threshold = input.threshold ?? DEBUGGER_LIST_VIRTUAL_THRESHOLD;
  const shouldVirtualize = input.count > threshold;

  if (!shouldVirtualize || input.count === 0) {
    return {
      startIndex: 0,
      endIndex: input.count,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight: input.count * input.rowHeight,
      shouldVirtualize: false,
    };
  }

  const scrollTop = input.scrollTop ?? 0;
  const viewportHeight = input.viewportHeight ?? 320;
  const overscan = input.overscan ?? DEBUGGER_LIST_OVERSCAN;
  const totalHeight = input.count * input.rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / input.rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / input.rowHeight) + overscan * 2;
  const endIndex = Math.min(input.count, startIndex + visibleCount);

  return {
    startIndex,
    endIndex,
    paddingTop: startIndex * input.rowHeight,
    paddingBottom: Math.max(0, totalHeight - endIndex * input.rowHeight),
    totalHeight,
    shouldVirtualize: true,
  };
}
