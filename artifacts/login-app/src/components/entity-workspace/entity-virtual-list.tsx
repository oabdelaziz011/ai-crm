import { useRef, type ReactNode } from "react";
import { useVirtualWindow } from "@/lib/customers-list/use-virtual-window";

type Props<T> = {
  items: T[];
  rowHeight: number;
  className?: string;
  maxHeightClassName?: string;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
};

/** Windowed list for long notes/timeline feeds. */
export function EntityVirtualList<T>({
  items,
  rowHeight,
  className,
  maxHeightClassName = "max-h-[28rem]",
  renderItem,
  getKey,
}: Props<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = items.length > 24;
  const window = useVirtualWindow({
    count: shouldVirtualize ? items.length : 0,
    rowHeight,
    overscan: 6,
    scrollRef,
  });

  if (!shouldVirtualize) {
    return (
      <div className={className}>
        {items.map((item, index) => (
          <div key={getKey(item, index)}>{renderItem(item, index)}</div>
        ))}
      </div>
    );
  }

  const visible = items.slice(window.startIndex, window.endIndex);

  return (
    <div ref={scrollRef} className={`${maxHeightClassName} overflow-y-auto ${className ?? ""}`}>
      <div style={{ height: window.totalHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${window.paddingTop}px)` }}>
          {visible.map((item, offset) => {
            const index = window.startIndex + offset;
            return (
              <div key={getKey(item, index)} style={{ minHeight: rowHeight }}>
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
