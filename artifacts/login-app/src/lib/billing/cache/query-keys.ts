export const financialInvoicesKey = (companyId: string) => ["financial", "invoices", companyId] as const;
export const financialPaymentsKey = (companyId: string) => ["financial", "payments", companyId] as const;
export const financialRefundsKey = (companyId: string) => ["financial", "refunds", companyId] as const;
export const financialMetricsKey = (companyId: string) => ["financial", "metrics", companyId] as const;
export const financialBreakdownKey = (companyId: string, dimension: string) =>
  ["financial", "breakdown", companyId, dimension] as const;
