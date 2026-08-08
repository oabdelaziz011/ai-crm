import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  SchedulingAvailabilityRepository,
} from "@/lib/scheduling/repositories/availability-repository";
import {
  SchedulingBookingRulesRepository,
  SchedulingHolidayRepository,
} from "@/lib/scheduling/repositories/rules-repository";
import {
  SchedulingBranchRepository,
  SchedulingResourceRepository,
} from "@/lib/scheduling/repositories/resource-repository";
import { SchedulingServiceCatalogRepository } from "@/lib/scheduling/repositories/service-catalog-repository";
import { ResourceServiceMappingRepository } from "@/lib/scheduling/repositories/resource-service-mapping-repository";
import { ResourceService } from "@/lib/scheduling/services/resource-service";
import { AvailabilityService } from "@/lib/scheduling/services/availability-service";
import { BookingRulesService } from "@/lib/scheduling/services/booking-rules-service";
import { HolidayService } from "@/lib/scheduling/services/holiday-service";
import { BranchService } from "@/lib/scheduling/services/branch-service";
import { ServiceCatalogService } from "@/lib/scheduling/services/service-catalog-service";
import { ServicePricingService } from "@/lib/scheduling/services/service-pricing-service";
import { ServicePricingRepository } from "@/lib/scheduling/repositories/service-pricing-repository";
import { ResourceCapabilityService } from "@/lib/scheduling/services/resource-capability-service";
import {
  AvailabilityEngine,
  getAvailabilityEngine,
} from "@/lib/scheduling/availability-engine/availability-engine";
import {
  SlotGenerationEngine,
  getSlotGenerationEngine,
} from "@/lib/scheduling/slot-generation-engine/slot-generation-engine";
import { SchedulingBookingRepository } from "@/lib/scheduling/repositories/scheduling-booking-repository";
import {
  BookingFactory,
  getBookingDomainServices,
  BookingDomainService,
  BookingRepository,
} from "@/lib/scheduling/booking-domain";
import {
  memoizeSchedulingFactory,
  WA_REQUEST_CACHE_NS,
} from "@/lib/scheduling/request-scoped-memo";
import { wxRecordDependencyConstruction, wxRecordServiceResolution } from "@workspace/automation-platform";

export function createSchedulingServices(client: SupabaseClient = supabase) {
  wxRecordServiceResolution("createSchedulingServices.call");
  return memoizeSchedulingFactory(WA_REQUEST_CACHE_NS.schedulingServices, client, () => {
    wxRecordDependencyConstruction("createSchedulingServices");
    const branchRepo = new SchedulingBranchRepository(client);
    const resourceRepo = new SchedulingResourceRepository(client);
    const availabilityRepo = new SchedulingAvailabilityRepository(client);
    const rulesRepo = new SchedulingBookingRulesRepository(client);
    const holidayRepo = new SchedulingHolidayRepository(client);
    const serviceCatalogRepo = new SchedulingServiceCatalogRepository(client);
    const servicePricingRepo = new ServicePricingRepository(client);
    const servicePricing = new ServicePricingService(servicePricingRepo, serviceCatalogRepo);
    const mappingRepo = new ResourceServiceMappingRepository(client);
    const bookingDomain = BookingFactory.create(client);

    return {
      branches: new BranchService(branchRepo),
      resources: new ResourceService(resourceRepo, availabilityRepo),
      availability: new AvailabilityService(availabilityRepo, resourceRepo),
      bookingRules: new BookingRulesService(rulesRepo),
      holidays: new HolidayService(holidayRepo),
      serviceCatalog: new ServiceCatalogService(serviceCatalogRepo, servicePricing),
      servicePricing,
      capabilities: new ResourceCapabilityService(mappingRepo, resourceRepo, serviceCatalogRepo),
      availabilityEngine: bookingDomain.availabilityEngine,
      slotGenerationEngine: bookingDomain.slotGenerationEngine,
      schedulingBookings: new SchedulingBookingRepository(client),
      bookingDomain: bookingDomain.bookingDomain,
      bookingRepository: bookingDomain.bookingRepository,
      bookingValidation: bookingDomain.bookingValidation,
    };
  });
}

export type SchedulingServices = ReturnType<typeof createSchedulingServices>;

let defaultServices: SchedulingServices | null = null;

export function getSchedulingServices(): SchedulingServices {
  if (!defaultServices) {
    defaultServices = createSchedulingServices();
  }
  return defaultServices;
}

export {
  BranchService,
  ResourceService,
  AvailabilityService,
  BookingRulesService,
  HolidayService,
  ServiceCatalogService,
  ResourceCapabilityService,
  AvailabilityEngine,
  getAvailabilityEngine,
  SlotGenerationEngine,
  getSlotGenerationEngine,
  SchedulingBookingRepository,
  BookingDomainService,
  BookingRepository,
  BookingFactory,
  getBookingDomainServices,
};

export * from "@/lib/scheduling/availability-engine";
export * from "@/lib/scheduling/slot-generation-engine";
export * from "@/lib/scheduling/booking-domain";
