import { createCustomerTimelineService } from "@/lib/customer-timeline/timeline-service";

/** Customer-facing timeline — reuses CustomerTimelineService. */
export class PortalTimelineService {
  private readonly timeline = createCustomerTimelineService();

  async buildForCustomer(customerId: string, companyId: string, locale = "en") {
    return this.timeline.buildTimeline(
      { customerId, companyId, limit: 50, groupMode: "day" },
      { locale, translate: (key) => key },
    );
  }
}
