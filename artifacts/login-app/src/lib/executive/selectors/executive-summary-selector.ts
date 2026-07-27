import type { ExecutiveSummary, RawExecutiveData } from "@/lib/executive/types";
import { computeTrend } from "@/lib/executive/selectors/executive-math";

export function buildExecutiveSummary(data: RawExecutiveData): ExecutiveSummary {
  const bookingsToday = data.bookingsToday.length;
  const completedToday = data.bookingsToday.filter((b) => b.status === "completed").length;
  const cancelledToday = data.bookingsToday.filter((b) => b.status === "cancelled").length;
  const noShowsToday = data.bookingsToday.filter((b) => b.status === "no_show").length;

  const yesterdayHistory = data.bookingsHistory.at(-2);
  const todayHistory = data.bookingsHistory.at(-1);
  const revenueTrend = computeTrend(
    data.financialMetrics.dailyCents,
    yesterdayHistory?.revenueCents ?? 0,
  );
  const bookingsTrend = computeTrend(bookingsToday, yesterdayHistory?.count ?? 0);

  return {
    todayRevenueCents: data.financialMetrics.dailyCents,
    monthlyRevenueCents: data.financialMetrics.monthlyCents,
    annualRevenueCents: data.financialMetrics.yearlyCents,
    bookingsToday,
    completedToday,
    cancelledToday,
    noShowsToday,
    outstandingBalanceCents: data.financialMetrics.outstandingCents,
    cashCollectedCents: data.paymentsTodayCents,
    averageInvoiceCents: data.financialMetrics.averageInvoiceCents,
    satisfactionScore: null,
    trends: {
      revenue: revenueTrend.trend,
      bookings: bookingsTrend.trend,
    },
  };
}
