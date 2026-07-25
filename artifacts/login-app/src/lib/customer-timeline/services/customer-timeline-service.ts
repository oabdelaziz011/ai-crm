import type {
  EnrichedTimelineActivity,
  EnrichedTimelineGroup,
  TimelineActivity,
  TimelineFetchInput,
  TimelinePage,
  TimelinePageRequest,
  TimelineRenderContext,
} from "@/lib/customer-timeline/types";
import type { CustomerTimelineRepository } from "@/lib/customer-timeline/repositories/customer-timeline-repository";
import { enrichActivity, memoizedGroupActivities } from "@/lib/customer-timeline/services/timeline-grouping";

/** Builds enriched timeline views — no UI logic. */
export class CustomerTimelineService {
  constructor(private readonly repository: CustomerTimelineRepository) {}

  async buildTimeline(
    request: TimelinePageRequest,
    renderContext?: TimelineRenderContext,
  ): Promise<TimelinePage & { enrichedGroups: EnrichedTimelineGroup[] }> {
    const page = await this.repository.fetchPage(request);
    const groupMode = request.groupMode ?? "day";
    const locale = renderContext?.locale ?? "en";

    const groups = memoizedGroupActivities(page.activities, groupMode, locale);
    const enrichedGroups: EnrichedTimelineGroup[] = groups.map((group) => ({
      ...group,
      activities: group.activities.map((activity) =>
        renderContext ? enrichActivity(activity, renderContext) : ({
          ...activity,
          title: activity.type,
          description: activity.metadata?.detail ?? null,
          iconKey: activity.type,
          accentClass: "text-muted-foreground bg-white/5 border-white/10",
        } as EnrichedTimelineActivity),
      ),
    }));

    return {
      ...page,
      groups,
      enrichedGroups,
    };
  }

  /** Legacy API — returns flat sorted list for backward compatibility. */
  async getTimeline(input: TimelineFetchInput): Promise<TimelineActivity[]> {
    return this.repository.fetchAll(input);
  }
}
