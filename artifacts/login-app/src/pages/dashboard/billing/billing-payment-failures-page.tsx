import { BillingPlatformFinancialListPage } from "@/components/billing/platform/billing-platform-financial-list-page";

export function BillingPaymentFailuresPage() {
  return (
    <BillingPlatformFinancialListPage
      config={{
        listType: "failures",
        titleKey: "billing.platform.failures.title",
        subtitleKey: "billing.platform.failures.subtitle",
        searchPlaceholderKey: "billing.platform.failures.search",
        emptyKey: "billing.platform.failures.empty",
        columns: [
          { key: "company", labelKey: "billing.tables.company" },
          { key: "amount", labelKey: "billing.tables.amount" },
          { key: "failure", labelKey: "billing.platform.failures.reason" },
          { key: "date", labelKey: "billing.tables.paidAt" },
        ],
      }}
    />
  );
}
