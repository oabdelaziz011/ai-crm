import { timelineAggregator, ensureTimelineAggregators } from "./aggregators";
import { CustomerTimelineRepository } from "./repositories/customer-timeline-repository";
import { CustomerTimelineService } from "./services/customer-timeline-service";
import { customerTimelineEntityAccess } from "./customer-timeline-entity-access";

export function createCustomerTimelineService(): CustomerTimelineService {
  const repository = new CustomerTimelineRepository(timelineAggregator, customerTimelineEntityAccess);
  return new CustomerTimelineService(repository);
}

export const customerTimelineService = createCustomerTimelineService();

export function ensureCustomerTimelineProviders(): void {
  ensureTimelineAggregators();
}
