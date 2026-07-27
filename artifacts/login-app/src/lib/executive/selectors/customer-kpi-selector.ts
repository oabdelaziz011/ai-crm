import type { CustomerKpis, RawExecutiveData } from "@/lib/executive/types";
import { percentRate } from "@/lib/executive/selectors/executive-math";

export function buildCustomerKpis(data: RawExecutiveData): CustomerKpis {
  const total = data.customers.total;
  const returning = data.customers.returning;
  const newCustomers = data.customers.newThisMonth;

  return {
    newCustomers,
    returningCustomers: returning,
    retentionRate: percentRate(returning, Math.max(total, 1)),
    churnRate: null,
    lifetimeValueCents: null,
    repeatBookingPercent: percentRate(returning, Math.max(total, 1)),
    averageCustomerAgeYears: null,
    customerGrowthPercent: percentRate(newCustomers, Math.max(total - newCustomers, 1)),
    marketingOptInPercent: 0,
    portalUsageCount: data.portalAnalytics.portalVisits,
  };
}
