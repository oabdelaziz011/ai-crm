import type { FinancialKpis, RawExecutiveData } from "@/lib/executive/types";
import { percentRate } from "@/lib/executive/selectors/executive-math";

export function buildFinancialKpis(data: RawExecutiveData, doctorCount: number, branchCount: number): FinancialKpis {
  const revenue = data.financialMetrics.monthlyCents;
  const refundRate = percentRate(data.financialMetrics.refundCents, Math.max(revenue, 1));

  return {
    revenueCents: revenue,
    profitCents: null,
    revenuePerDoctorCents: doctorCount > 0 ? Math.round(revenue / doctorCount) : 0,
    revenuePerBranchCents: branchCount > 0 ? Math.round(revenue / branchCount) : 0,
    revenuePerServiceCents: data.financialMetrics.invoiceCount > 0
      ? Math.round(revenue / data.financialMetrics.invoiceCount)
      : 0,
    outstandingInvoicesCents: data.financialMetrics.outstandingCents,
    refundRate,
    averagePaymentTimeHours: 24,
    taxCollectedCents: data.taxCollectedCents,
    collectionsCents: data.paymentsTodayCents,
    providerBreakdown: data.providerBreakdown,
  };
}
