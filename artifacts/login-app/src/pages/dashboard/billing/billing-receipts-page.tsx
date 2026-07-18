import { BillingPlatformFinancialListPage } from "@/components/billing/platform/billing-platform-financial-list-page";

export function BillingReceiptsPage() {
  return (
    <BillingPlatformFinancialListPage
      config={{
        listType: "receipts",
        titleKey: "billing.platform.receipts.title",
        subtitleKey: "billing.platform.receipts.subtitle",
        searchPlaceholderKey: "billing.platform.receipts.search",
        emptyKey: "billing.platform.receipts.empty",
        columns: [
          { key: "company", labelKey: "billing.tables.company" },
          { key: "number", labelKey: "billing.tables.receiptNumber" },
          { key: "amount", labelKey: "billing.tables.amount" },
          { key: "date", labelKey: "billing.tables.issuedAt" },
        ],
      }}
    />
  );
}
