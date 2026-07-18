import {
  BillingPlatformFinancialListPage,
} from "@/components/billing/platform/billing-platform-financial-list-page";

export function BillingPaymentsPage() {
  return (
    <BillingPlatformFinancialListPage
      config={{
        listType: "payments",
        titleKey: "billing.platform.payments.title",
        subtitleKey: "billing.platform.payments.subtitle",
        searchPlaceholderKey: "billing.platform.payments.search",
        emptyKey: "billing.platform.payments.empty",
        columns: [
          { key: "company", labelKey: "billing.tables.company" },
          { key: "amount", labelKey: "billing.tables.amount" },
          { key: "status", labelKey: "billing.tables.status" },
          { key: "provider", labelKey: "billing.tables.provider" },
          { key: "date", labelKey: "billing.tables.paidAt" },
        ],
      }}
    />
  );
}
