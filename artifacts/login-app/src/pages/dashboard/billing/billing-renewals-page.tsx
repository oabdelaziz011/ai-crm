import { BillingPlatformFinancialListPage } from "@/components/billing/platform/billing-platform-financial-list-page";

export function BillingRenewalsPage() {
  return (
    <BillingPlatformFinancialListPage
      config={{
        listType: "renewals",
        titleKey: "billing.platform.renewals.title",
        subtitleKey: "billing.platform.renewals.subtitle",
        searchPlaceholderKey: "billing.searchPlaceholder",
        emptyKey: "billing.platform.renewals.empty",
        columns: [
          { key: "company", labelKey: "billing.tables.company" },
          { key: "plan", labelKey: "billing.tables.plan" },
          { key: "status", labelKey: "billing.tables.status" },
          { key: "date", labelKey: "billing.tables.renewal" },
        ],
      }}
    />
  );
}
