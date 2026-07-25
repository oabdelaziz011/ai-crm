import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SCHEDULING_BOOKING_STATUSES } from "@/lib/scheduling/booking-domain";
import type { CalendarFilters } from "@/lib/calendar/types/calendar-view-state";
import { useTranslation } from "react-i18next";

type CalendarFilterOption = {
  id: string;
  name: string;
};

type CalendarFilterBarProps = {
  filters: CalendarFilters;
  branches: CalendarFilterOption[];
  resources: CalendarFilterOption[];
  onBranchChange: (branchId: string | null) => void;
  onResourceChange: (resourceIds: string[] | "all") => void;
  onToggleStatus: (status: (typeof SCHEDULING_BOOKING_STATUSES)[number]) => void;
  onClear: () => void;
};

export function CalendarFilterBar({
  filters,
  branches,
  resources,
  onBranchChange,
  onResourceChange,
  onToggleStatus,
  onClear,
}: CalendarFilterBarProps) {
  const { t } = useTranslation("common");
  const selectedResourceId =
    filters.resourceIds === "all" ? "all" : (filters.resourceIds[0] ?? "all");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/10 px-3 py-2">
      <span className="text-xs text-muted-foreground">{t("calendar.filters.label")}</span>

      <Select
        value={filters.branchId ?? "all"}
        onValueChange={(value) => onBranchChange(value === "all" ? null : value)}
      >
        <SelectTrigger className="h-8 w-[160px] border-white/10 text-xs">
          <SelectValue placeholder={t("calendar.filters.branch")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("calendar.filters.allBranches")}</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedResourceId}
        onValueChange={(value) =>
          onResourceChange(value === "all" ? "all" : [value])
        }
      >
        <SelectTrigger className="h-8 w-[180px] border-white/10 text-xs">
          <SelectValue placeholder={t("calendar.filters.resource")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("calendar.filters.allResources")}</SelectItem>
          {resources.map((resource) => (
            <SelectItem key={resource.id} value={resource.id}>
              {resource.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex flex-wrap items-center gap-1">
        {SCHEDULING_BOOKING_STATUSES.filter((status) => status !== "rescheduled").map(
          (status) => {
            const active = filters.statuses.includes(status);
            return (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={active ? "secondary" : "ghost"}
                className="h-7 px-2 text-[11px]"
                onClick={() => onToggleStatus(status)}
              >
                {t(`calendar.status.${status}`)}
              </Button>
            );
          },
        )}
      </div>

      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onClear}>
        {t("calendar.filters.clear")}
      </Button>
    </div>
  );
}
