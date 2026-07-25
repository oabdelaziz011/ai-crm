import type { TimelineFilterId, TimelineGroupMode } from "@/lib/customer-timeline/types";
import { TIMELINE_FILTERS } from "@/lib/customer-timeline/timeline-filters";

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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {TIMELINE_FILTERS.map((filterId) => (
          <button
            key={filterId}
            type="button"
            onClick={() => onFilterChange(filterId)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              filter === filterId
                ? "bg-primary/15 text-primary border-primary/30"
                : "border-white/10 text-muted-foreground hover:text-foreground"
            }`}
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
            className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
              groupMode === mode
                ? "bg-muted text-foreground border-border"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {translate(`dashboard.customerProfile.timeline.groupModes.${mode}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
