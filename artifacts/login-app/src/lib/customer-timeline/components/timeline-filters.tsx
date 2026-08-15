import type { TimelineFilterId, TimelineGroupMode } from "@/lib/customer-timeline/types";
import { TIMELINE_FILTERS } from "@/lib/customer-timeline/timeline-filters";
import { cn } from "@/lib/utils";

const GROUP_MODES: TimelineGroupMode[] = ["day", "week", "month", "conversation", "workflow", "booking"];

type Props = {
  filter: TimelineFilterId;
  groupMode: TimelineGroupMode;
  onFilterChange: (filter: TimelineFilterId) => void;
  onGroupModeChange: (mode: TimelineGroupMode) => void;
  translate: (key: string) => string;
};

export function TimelineFilters({
  filter,
  groupMode,
  onFilterChange,
  onGroupModeChange,
  translate,
}: Props) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {TIMELINE_FILTERS.map((filterId) => (
          <button
            key={filterId}
            type="button"
            onClick={() => onFilterChange(filterId)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              filter === filterId
                ? "border-primary/35 bg-primary/10 text-primary"
                : "border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {translate(`dashboard.customerProfile.timeline.filters.${filterId}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {GROUP_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onGroupModeChange(mode)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
              groupMode === mode
                ? "border-border bg-background text-foreground"
                : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-background hover:text-foreground",
            )}
          >
            {translate(`dashboard.customerProfile.timeline.groupModes.${mode}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
