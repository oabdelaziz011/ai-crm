import { useQuery } from "@tanstack/react-query";
import { getFinancialPlatformServices } from "@/lib/billing/services/financial-platform-service";
import {
  financialBreakdownKey,
  financialInvoicesKey,
  financialMetricsKey,
  financialPaymentsKey,
  financialRefundsKey,
} from "@/lib/billing/cache/query-keys";

const financial = getFinancialPlatformServices();

export function useFinancialMetrics(companyId: string | null) {
  return useQuery({
    queryKey: financialMetricsKey(companyId ?? ""),
    enabled: Boolean(companyId),
    queryFn: () => financial.reports.getMetrics(companyId!),
    staleTime: 30_000,
  });
}

export function useFinancialInvoices(companyId: string | null, limit = 200) {
  return useQuery({
    queryKey: [...financialInvoicesKey(companyId ?? ""), limit],
    enabled: Boolean(companyId),
    queryFn: () => financial.invoices.list(companyId!, limit),
  });
}

export function useFinancialPayments(companyId: string | null, limit = 200) {
  return useQuery({
    queryKey: [...financialPaymentsKey(companyId ?? ""), limit],
    enabled: Boolean(companyId),
    queryFn: () => financial.payments.listPayments(companyId!, limit),
  });
}

export function useFinancialRefunds(companyId: string | null) {
  return useQuery({
    queryKey: financialRefundsKey(companyId ?? ""),
    enabled: Boolean(companyId),
    queryFn: () => financial.refunds.listByCompany(companyId!),
  });
}

export function useFinancialBreakdown(companyId: string | null, dimension: "service" | "provider" | "doctor" | "branch") {
  return useQuery({
    queryKey: financialBreakdownKey(companyId ?? "", dimension),
    enabled: Boolean(companyId),
    queryFn: () => financial.reports.getBreakdown(companyId!, dimension),
  });
}

export function useFinancialDashboard(companyId: string | null) {
  const metrics = useFinancialMetrics(companyId);
  const invoices = useFinancialInvoices(companyId);
  const payments = useFinancialPayments(companyId);
  const refunds = useFinancialRefunds(companyId);

  return {
    metrics,
    invoices,
    payments,
    refunds,
    isLoading: metrics.isLoading || invoices.isLoading || payments.isLoading,
  };
}
