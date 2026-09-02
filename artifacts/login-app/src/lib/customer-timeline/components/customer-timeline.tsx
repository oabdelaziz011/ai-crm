import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityQueryFailedError,
  CustomerNotFoundInTenantError,
  TimelineError,
} from "@workspace/activity-timeline";
import type { TimelineFilterId, TimelineGroupMode } from "@/lib/customer-timeline/types";
import {
  useTimelineActivities,
  useTimelineFilters,
  useTimelineSearch,
} from "@/lib/customer-timeline/hooks/use-customer-timeline";
import { TimelineHeader } from "./timeline-header";
import { TimelineSearch } from "./timeline-search";
import { TimelineFilters } from "./timeline-filters";
import { TimelineList } from "./timeline-list";
import { TimelineLoading } from "./timeline-loading";
import { cn } from "@/lib/utils";

type CustomerTimelineProps = {
  customerId: string;
  companyId?: string | null;
  cardVariant?: "default" | "workspace";
  fillHeight?: boolean;
};

function resolveTimelineErrorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): { title: string; hint?: string; kind: "not_found" | "failed" } {
  if (error instanceof CustomerNotFoundInTenantError) {
    return {
      kind: "not_found",
      title: t("dashboard.customerWorkspace.timeline.errors.customerNotFoundInTenant"),
      hint: t("dashboard.customerWorkspace.timeline.errors.customerNotFoundInTenantHint"),
    };
  }
  if (error instanceof ActivityQueryFailedError || error instanceof TimelineError) {
    if (error.code === "CUSTOMER_NOT_FOUND_IN_TENANT") {
      return {
        kind: "not_found",
        title: t("dashboard.customerWorkspace.timeline.errors.customerNotFoundInTenant"),
        hint: t("dashboard.customerWorkspace.timeline.errors.customerNotFoundInTenantHint"),
      };
    }
    return {
      kind: "failed",
      title: t("dashboard.customerWorkspace.timeline.errors.queryFailed"),
      hint: error.message,
    };
  }
  if (error instanceof Error && /not found in tenant/i.test(error.message)) {
    return {
      kind: "not_found",
      title: t("dashboard.customerWorkspace.timeline.errors.customerNotFoundInTenant"),
      hint: t("dashboard.customerWorkspace.timeline.errors.customerNotFoundInTenantHint"),
    };
  }
  return {
    kind: "failed",
    title: t("dashboard.customerWorkspace.timeline.errors.queryFailed"),
    hint: error instanceof Error ? error.message : undefined,
  };
}

export function CustomerTimelinePanel({
  customerId,
  companyId,
  cardVariant = "default",
  fillHeight = false,
}: CustomerTimelineProps) {
  const { t, i18n } = useTranslation("common");
  const { filter, setLegacyFilter, groupMode, setGroupMode } = useTimelineFilters();
  const { search, setSearch, debouncedSearch } = useTimelineSearch();

  const timelineFilter = useMemo(
    () => ({ legacyFilterId: filter.legacyFilterId as TimelineFilterId }),
    [filter.legacyFilterId],
  );

  const renderContext = useMemo(
    () => ({
      locale: i18n.language,
      translate: (key: string, options?: Record<string, unknown>) => t(key, options),
    }),
    [i18n.language, t],
  );

  const query = useTimelineActivities(
    customerId,
    companyId ?? null,
    timelineFilter,
    debouncedSearch,
    groupMode,
    renderContext,
  );

  const groups = useMemo(
    () => query.data?.pages.flatMap((page) => page.enrichedGroups) ?? [],
    [query.data?.pages],
  );

  if (query.isLoading) {
    return (
      <div className={cn("flex items-center justify-center", fillHeight && "min-h-0 flex-1")}>
        <TimelineLoading label={t("dashboard.customerProfile.timeline.loading")} />
      </div>
    );
  }

  if (query.error) {
    const mapped = resolveTimelineErrorMessage(query.error, t);
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl border p-8 text-center",
          mapped.kind === "not_found"
            ? "border-destructive/20 bg-destructive/5"
            : "border-destructive/20 bg-destructive/5",
          fillHeight && "min-h-0 flex-1",
        )}
      >
        <div className="max-w-md space-y-1">
          <p className="text-sm font-semibold text-destructive">{mapped.title}</p>
          {mapped.hint ? <p className="text-xs text-muted-foreground">{mapped.hint}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", fillHeight && "min-h-0 flex-1")}>
      <div className="shrink-0 space-y-3">
        {cardVariant !== "workspace" ? (
          <TimelineHeader
            title={t("dashboard.customerProfile.timeline.title")}
            subtitle={t("dashboard.customerProfile.timeline.subtitle")}
          />
        ) : null}

        <TimelineSearch
          value={search}
          onChange={setSearch}
          placeholder={t("dashboard.customerProfile.timeline.searchPlaceholder")}
        />

        <TimelineFilters
          filter={(filter.legacyFilterId ?? "all") as TimelineFilterId}
          groupMode={groupMode}
          onFilterChange={(value) => setLegacyFilter(value)}
          onGroupModeChange={(mode: TimelineGroupMode) => setGroupMode(mode)}
          translate={(key) => t(key)}
        />
      </div>

      <div
        className={cn(
          fillHeight ? "min-h-0 flex-1 overflow-y-auto pe-1" : undefined,
        )}
      >
        <TimelineList
          groups={groups}
          renderContext={renderContext}
          hasMore={query.hasNextPage}
          isFetchingMore={query.isFetchingNextPage}
          onLoadMore={() => void query.fetchNextPage()}
          emptyMessage={
            debouncedSearch
              ? t("dashboard.customerProfile.timeline.emptySearch")
              : t("dashboard.customerWorkspace.timeline.empty")
          }
          emptyDescription={
            debouncedSearch
              ? undefined
              : t("dashboard.customerWorkspace.timeline.emptyDescription")
          }
          loadMoreLabel={t("dashboard.customerProfile.timeline.loadMore")}
          cardVariant={cardVariant}
          fillHeight={fillHeight}
        />
      </div>
    </div>
  );
}

export { CustomerTimelinePanel as CustomerTimeline };
