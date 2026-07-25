import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { EnrichedTimelineGroup, TimelineRenderContext } from "@/lib/customer-timeline/types";
import { TimelineGroupSection } from "./timeline-group";
import { TimelineEmptyState } from "./timeline-empty-state";

type Props = {
  groups: EnrichedTimelineGroup[];
  renderContext: TimelineRenderContext;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  emptyMessage: string;
  loadMoreLabel: string;
};

const WINDOW_SIZE = 40;

export function TimelineList({
  groups,
  renderContext,
  hasMore,
  isFetchingMore,
  onLoadMore,
  emptyMessage,
  loadMoreLabel,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const visibleGroups = useMemo(() => {
    const flatCount = groups.reduce((sum, group) => sum + group.activities.length, 0);
    if (flatCount <= WINDOW_SIZE) return groups;

    let remaining = WINDOW_SIZE;
    const trimmed: EnrichedTimelineGroup[] = [];
    for (const group of groups) {
      if (remaining <= 0) break;
      const slice = group.activities.slice(0, remaining);
      remaining -= slice.length;
      trimmed.push({ ...group, activities: slice });
    }
    return trimmed;
  }, [groups]);

  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingMore) {
          onLoadMore();
        }
      },
      { rootMargin: "120px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, onLoadMore]);

  if (groups.length === 0) {
    return <TimelineEmptyState message={emptyMessage} />;
  }

  return (
    <div className="space-y-5">
      {visibleGroups.map((group) => (
        <TimelineGroupSection key={group.key} group={group} renderContext={renderContext} />
      ))}
      {hasMore ? (
        <div ref={sentinelRef} className="flex justify-center py-2">
          <Button variant="ghost" size="sm" disabled={isFetchingMore} onClick={onLoadMore}>
            {loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
