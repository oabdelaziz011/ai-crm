import { BillingPlatformFinancialListPage } from "@/components/billing/platform/billing-platform-financial-list-page";

export function BillingInvoicesPage() {
  return (
    <BillingPlatformFinancialListPage
      config={{
        listType: "invoices",
        titleKey: "billing.platform.subscriptionInvoices.title",
        subtitleKey: "billing.platform.subscriptionInvoices.subtitle",
        searchPlaceholderKey: "billing.platform.subscriptionInvoices.search",
        emptyKey: "billing.platform.subscriptionInvoices.empty",
        columns: [
          { key: "company", labelKey: "billing.tables.company" },
          { key: "number", labelKey: "billing.tables.invoiceNumber" },
          { key: "amount", labelKey: "billing.tables.amount" },
          { key: "status", labelKey: "billing.tables.status" },
          { key: "date", labelKey: "billing.tables.issuedAt" },
        ],
      }}
    />
  );
}
