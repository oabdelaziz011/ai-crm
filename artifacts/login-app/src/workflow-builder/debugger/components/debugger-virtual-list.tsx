import { memo, useRef, type ReactNode } from "react";
import { useVirtualWindow } from "@/lib/customers-list/use-virtual-window";
import type { DebuggerListWindow } from "../utilities/debugger-list-window";

type DebuggerVirtualListProps<T> = {
  items: readonly T[];
  listWindow: DebuggerListWindow;
  rowHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  listClassName?: string;
};

function DebuggerVirtualListInner<T>({
  items,
  listWindow,
  rowHeight,
  renderItem,
  listClassName = "space-y-2",
}: DebuggerVirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualWindow = useVirtualWindow({
    count: items.length,
    rowHeight,
    scrollRef,
    overscan: 8,
  });

  if (items.length === 0) {
    return null;
  }

  if (!listWindow.shouldVirtualize) {
    return <ul className={listClassName}>{items.map((item, index) => renderItem(item, index))}</ul>;
  }

  const visibleItems = items.slice(virtualWindow.startIndex, virtualWindow.endIndex);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <ul
        className={listClassName}
        style={{ paddingTop: virtualWindow.paddingTop, paddingBottom: virtualWindow.paddingBottom }}
      >
        {visibleItems.map((item, offset) => renderItem(item, virtualWindow.startIndex + offset))}
      </ul>
    </div>
  );
}

export const DebuggerVirtualList = memo(DebuggerVirtualListInner) as typeof DebuggerVirtualListInner;
