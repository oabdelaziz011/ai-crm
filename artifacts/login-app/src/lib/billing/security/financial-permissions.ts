/** Financial platform permission helpers. */
export const FINANCIAL_PERMISSIONS = {
  viewDashboard: "invoices.view",
  manageInvoices: "invoices.manage",
  recordPayments: "invoices.manage",
  processRefunds: "invoices.manage",
  viewReports: "invoices.view",
  manageSettings: "billing.settings.manage",
} as const;

export function canViewFinancialDashboard(permissions: string[]): boolean {
  return permissions.includes(FINANCIAL_PERMISSIONS.viewDashboard);
}

export function canManageInvoices(permissions: string[]): boolean {
  return permissions.includes(FINANCIAL_PERMISSIONS.manageInvoices);
}
