import { BillingPlatformFinancialListPage } from "@/components/billing/platform/billing-platform-financial-list-page";

export function BillingExpirationsPage() {
  return (
    <BillingPlatformFinancialListPage
      config={{
        listType: "expirations",
        titleKey: "billing.platform.expirations.title",
        subtitleKey: "billing.platform.expirations.subtitle",
        searchPlaceholderKey: "billing.searchPlaceholder",
        emptyKey: "billing.platform.expirations.empty",
        columns: [
          { key: "company", labelKey: "billing.tables.company" },
          { key: "status", labelKey: "billing.tables.status" },
          { key: "date", labelKey: "billing.detail.periodEnd" },
        ],
      }}
    />
  );
}
