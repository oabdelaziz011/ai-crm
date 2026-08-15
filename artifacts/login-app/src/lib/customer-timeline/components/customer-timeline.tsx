import { useMemo } from "react";
import { useTranslation } from "react-i18next";
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
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center",
          fillHeight && "min-h-0 flex-1",
        )}
      >
        <p className="text-sm text-destructive">
          {query.error.message || t("dashboard.customerProfile.timeline.loadError")}
        </p>
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
              : t("dashboard.customerProfile.timeline.empty")
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
