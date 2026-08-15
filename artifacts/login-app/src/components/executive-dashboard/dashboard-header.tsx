import { memo } from "react";
import { format } from "date-fns";
import { Filter, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DashboardTimeRange } from "@/lib/dashboard";

export type ExecutiveKpiFilterId = "all" | "finance" | "customers" | "operations";

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
  filterAllLabel: string;
  filterFinanceLabel: string;
  filterCustomersLabel: string;
  filterOperationsLabel: string;
  kpiFilter: ExecutiveKpiFilterId;
  isRefreshing?: boolean;
  onTimeRangeChange: (value: DashboardTimeRange) => void;
  onSearchChange: (value: string) => void;
  onKpiFilterChange: (value: ExecutiveKpiFilterId) => void;
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
  filterAllLabel,
  filterFinanceLabel,
  filterCustomersLabel,
  filterOperationsLabel,
  kpiFilter,
  isRefreshing,
  onTimeRangeChange,
  onSearchChange,
  onKpiFilterChange,
  onRefresh,
  timeRangeOptions,
}: DashboardHeaderProps) {
  const filterOptions: Array<{ id: ExecutiveKpiFilterId; label: string }> = [
    { id: "all", label: filterAllLabel },
    { id: "finance", label: filterFinanceLabel },
    { id: "customers", label: filterCustomersLabel },
    { id: "operations", label: filterOperationsLabel },
  ];

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
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={kpiFilter === "all" ? "secondary" : "default"}
              type="button"
              className="shrink-0"
            >
              <Filter className="me-2 size-4" aria-hidden />
              {filterLabel}
              {kpiFilter !== "all" ? (
                <span className="ms-2 rounded-full bg-background/80 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                  1
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {filterLabel}
            </p>
            <div className="space-y-1">
              {filterOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    "flex w-full rounded-md px-2 py-1.5 text-start text-sm transition-colors hover:bg-muted",
                    kpiFilter === option.id && "bg-primary/10 font-medium text-primary",
                  )}
                  onClick={() => onKpiFilterChange(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
});

export function formatExecutiveDate(date: Date): string {
  return format(date, "EEEE, MMMM d, yyyy");
}
