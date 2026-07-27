export type InvoiceLifecycleStatus =
  | "draft"
  | "pending"
  | "issued"
  | "partially_paid"
  | "paid"
  | "cancelled"
  | "refunded";

export type PaymentMethodType = "cash" | "card" | "bank_transfer" | "wallet" | "online" | "mixed";

export type PaymentStatus = "pending" | "processing" | "completed" | "failed" | "refunded" | "partially_refunded";

export type RefundType = "full" | "partial" | "manual" | "automatic";

export type RefundStatus = "pending" | "approved" | "processing" | "completed" | "rejected";

export type LedgerEntryType = "invoice" | "payment" | "refund" | "discount" | "tax" | "adjustment";

export type LedgerDirection = "debit" | "credit";

export type PricingRuleType = "service" | "resource" | "branch" | "insurance" | "vip" | "package" | "bundle";

export type DiscountType = "percentage" | "fixed" | "coupon" | "campaign" | "referral" | "membership" | "employee";

export type TaxMode = "inclusive" | "exclusive" | "exempt";

export type PaymentProviderCode = "sandbox" | "stripe" | "paymob" | "fawry" | "manual";

export type InvoiceDocumentType = "invoice" | "credit_note" | "debit_note";

export type WebhookProcessingStatus = "pending" | "processing" | "processed" | "failed";
