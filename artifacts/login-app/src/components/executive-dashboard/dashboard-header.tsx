import { memo } from "react";
import { format } from "date-fns";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardTimeRange } from "@/lib/dashboard";

type DashboardHeaderProps = {
  companyName: string;
  dateLabel: string;
  title: string;
  subtitle: string;
  timeRange: DashboardTimeRange;
  timeRangeLabel: string;
  searchPlaceholder: string;
  searchValue: string;
  refreshLabel: string;
  filterLabel: string;
  isRefreshing?: boolean;
  onTimeRangeChange: (value: DashboardTimeRange) => void;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  timeRangeOptions: Array<{ value: DashboardTimeRange; label: string }>;
};

export const DashboardHeader = memo(function DashboardHeader({
  companyName,
  dateLabel,
  title,
  subtitle,
  timeRange,
  timeRangeLabel,
  searchPlaceholder,
  searchValue,
  refreshLabel,
  filterLabel,
  isRefreshing,
  onTimeRangeChange,
  onSearchChange,
  onRefresh,
  timeRangeOptions,
}: DashboardHeaderProps) {
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {companyName}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <p className="mt-2 text-xs text-muted-foreground">{dateLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={timeRange} onValueChange={(value) => onTimeRangeChange(value as DashboardTimeRange)}>
            <SelectTrigger className="w-[140px]" aria-label={timeRangeLabel}>
              <SelectValue placeholder={timeRangeLabel} />
            </SelectTrigger>
            <SelectContent>
              {timeRangeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
          >
            <RefreshCw className={isRefreshing ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} aria-hidden />
            {refreshLabel}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="ps-9"
            aria-label={searchPlaceholder}
          />
        </div>
        <Button variant="secondary" type="button" className="shrink-0">
          {filterLabel}
        </Button>
      </div>
    </header>
  );
});

export function formatExecutiveDate(date: Date): string {
  return format(date, "EEEE, MMMM d, yyyy");
}
