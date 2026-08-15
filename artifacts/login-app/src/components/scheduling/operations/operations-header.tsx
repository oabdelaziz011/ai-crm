import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { Download, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { BranchSelector } from "@/lib/company/branches/components/branch-selector";
import type { BranchRecord } from "@/lib/company/branches/types";
import type { OperationsDatePreset, OperationsFilters } from "@/lib/scheduling/operations/types";
import type { SchedulingResource } from "@/lib/scheduling/types";
import type { SchedulingService } from "@/lib/scheduling/types";
import { SCHEDULING_BOOKING_STATUSES } from "@/lib/scheduling/booking-domain";
import { resolveOperationsDate } from "@/lib/scheduling/operations/utilities";

type OperationsHeaderProps = {
  filters: OperationsFilters;
  onFiltersChange: (patch: Partial<OperationsFilters>) => void;
  branches: BranchRecord[];
  resources: SchedulingResource[];
  services: SchedulingService[];
  onRefresh: () => void;
  onExport: () => void;
  isRefreshing: boolean;
  exportDisabled?: boolean;
};

export function OperationsHeader({
  filters,
  onFiltersChange,
  branches,
  resources,
  services,
  onRefresh,
  onExport,
  isRefreshing,
  exportDisabled,
}: OperationsHeaderProps) {
  const { t, i18n } = useTranslation("common");
  const dateLocale = i18n.language?.startsWith("ar") ? ar : enUS;
  const fieldClass = "h-9 rounded-md border border-border bg-background px-3 text-sm";

  const presets: { id: OperationsDatePreset; label: string }[] = [
    { id: "today", label: t("scheduling.operations.date.today") },
    { id: "tomorrow", label: t("scheduling.operations.date.tomorrow") },
    { id: "this_week", label: t("scheduling.operations.date.thisWeek") },
    { id: "custom", label: t("scheduling.operations.date.custom") },
  ];

  return (
    <div className="space-y-4 bg-background">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {t("scheduling.operations.title")}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            {t("scheduling.operations.subtitle")}
          </p>
          <Button asChild variant="link" className="h-auto px-0 text-sm">
            <Link href="~/dashboard/settings/scheduling">
              {t("calendar.links.schedulingSetup")}
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="gap-2 border-border bg-background"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {t("buttons.refresh")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            disabled={exportDisabled}
            className="gap-2 border-border bg-background"
          >
            <Download className="h-4 w-4" />
            {t("buttons.export")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.id}
            size="sm"
            variant={filters.datePreset === preset.id ? "default" : "outline"}
            className={filters.datePreset === preset.id ? undefined : "border-border bg-background"}
            onClick={() => onFiltersChange({ datePreset: preset.id })}
          >
            {preset.label}
          </Button>
        ))}
        {filters.datePreset === "custom" ? (
          <input
            type="date"
            value={filters.date}
            onChange={(e) => onFiltersChange({ date: e.target.value })}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <BranchSelector
          branches={branches}
          value={filters.branchId}
          onChange={(branchId) => onFiltersChange({ branchId })}
          allowAll
        />
        <select
          value={filters.resourceIds[0] ?? ""}
          onChange={(e) =>
            onFiltersChange({ resourceIds: e.target.value ? [e.target.value] : [] })
          }
          className={fieldClass}
        >
          <option value="">{t("scheduling.operations.filters.allResources")}</option>
          {resources.map((resource) => (
            <option key={resource.id} value={resource.id}>
              {resource.name}
            </option>
          ))}
        </select>
        <select
          value={filters.serviceIds[0] ?? ""}
          onChange={(e) =>
            onFiltersChange({ serviceIds: e.target.value ? [e.target.value] : [] })
          }
          className={fieldClass}
        >
          <option value="">{t("scheduling.operations.filters.allServices")}</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
        <select
          value={filters.statuses[0] ?? ""}
          onChange={(e) =>
            onFiltersChange({
              statuses: e.target.value
                ? [e.target.value as (typeof SCHEDULING_BOOKING_STATUSES)[number]]
                : [],
            })
          }
          className={fieldClass}
        >
          <option value="">{t("scheduling.operations.filters.allStatuses")}</option>
          {SCHEDULING_BOOKING_STATUSES.filter((s) => s !== "rescheduled").map((status) => (
            <option key={status} value={status}>
              {t(`scheduling.operations.status.${status}`, {
                defaultValue: t(`calendar.status.${status}`),
              })}
            </option>
          ))}
        </select>
      </div>

      <input
        value={filters.search}
        onChange={(e) => onFiltersChange({ search: e.target.value })}
        placeholder={t("scheduling.operations.filters.searchPlaceholder")}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />

      <p className="text-xs text-muted-foreground">
        {t("scheduling.operations.date.viewing", {
          date: format(
            new Date(`${resolveOperationsDate(filters.datePreset, filters.date)}T12:00:00`),
            "PPP",
            { locale: dateLocale },
          ),
        })}
      </p>
    </div>
  );
}
