import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OperationsDayData,
  OperationsFilters,
} from "@/lib/scheduling/operations/types";
import { OperationsRepository } from "@/lib/scheduling/operations/repositories";
import { OperationsTimelineService } from "@/lib/scheduling/operations/services/operations-timeline-service";
import {
  computeDailyStats,
  computeOperationsKpis,
  filterOperationsBookings,
  mapRecordToOperationsBooking,
} from "@/lib/scheduling/operations/selectors";
import { resolveOperationsDate } from "@/lib/scheduling/operations/utilities";
import { buildWaitingQueue } from "@/lib/scheduling/operations/queue";
import {
  computeAdvancedKpis,
  computeCapacityMetrics,
  computeResourceUtilization,
} from "@/lib/scheduling/operations/analytics";

export class OperationsDataService {
  private readonly repository: OperationsRepository;
  private readonly timelineService: OperationsTimelineService;

  constructor(client: SupabaseClient) {
    this.repository = new OperationsRepository(client);
    this.timelineService = new OperationsTimelineService(client);
  }

  async loadDayData(
    companyId: string,
    filters: OperationsFilters,
    timezone: string,
  ): Promise<OperationsDayData> {
    const date = resolveOperationsDate(filters.datePreset, filters.date, timezone);

    const records = await this.repository.listBookingsForDay({
      companyId,
      date,
      timezone,
      branchId: filters.branchId,
      resourceIds: filters.resourceIds.length ? filters.resourceIds : undefined,
      serviceIds: filters.serviceIds.length ? filters.serviceIds : undefined,
      statuses: filters.statuses.length ? filters.statuses : undefined,
    });

    const bookings = filterOperationsBookings(
      records.map((record) => mapRecordToOperationsBooking(record, timezone)),
      filters,
    );

    const timelineSlots = await this.timelineService.buildTimeline({
      companyId,
      date,
      timezone,
      bookings,
      resourceIds: filters.resourceIds,
    });

    const kpis = computeOperationsKpis(bookings, timelineSlots);
    const dailyStats = computeDailyStats(bookings, timelineSlots);
    const resourceUtilization = computeResourceUtilization(bookings);
    const capacity = computeCapacityMetrics(kpis, timelineSlots);
    const advancedKpis = computeAdvancedKpis(bookings, timelineSlots, resourceUtilization);
    const waitingQueue = buildWaitingQueue(bookings);

    return {
      date,
      timezone,
      bookings,
      timelineSlots,
      kpis,
      dailyStats,
      capacity,
      resourceUtilization,
      advancedKpis,
      waitingQueue,
    };
  }
}
