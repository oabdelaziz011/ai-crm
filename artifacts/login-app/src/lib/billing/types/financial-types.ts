import type {
  DiscountType,
  InvoiceDocumentType,
  InvoiceLifecycleStatus,
  LedgerDirection,
  LedgerEntryType,
  PaymentMethodType,
  PaymentProviderCode,
  PaymentStatus,
  PricingRuleType,
  RefundStatus,
  RefundType,
  TaxMode,
} from "@/lib/billing/types/financial-enums";

export type MoneyAmount = {
  cents: number;
  currency: string;
};

export type InvoiceLineItem = {
  id?: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  serviceId?: string | null;
  resourceId?: string | null;
  sortOrder?: number;
};

export type CustomerInvoice = {
  id: string;
  companyId: string;
  customerId: string | null;
  bookingId: string | null;
  invoiceNumber: string | null;
  status: InvoiceLifecycleStatus;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  version: number;
  taxMode: TaxMode;
  branchId: string | null;
  notes: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  lineItems: InvoiceLineItem[];
  createdAt: string;
  updatedAt: string;
};

export type CreateInvoiceInput = {
  companyId: string;
  customerId: string;
  bookingId?: string | null;
  branchId?: string | null;
  lineItems: Omit<InvoiceLineItem, "id">[];
  taxMode?: TaxMode;
  notes?: string | null;
  dueAt?: string | null;
  discountCode?: string | null;
  createdBy?: string | null;
};

export type CustomerPayment = {
  id: string;
  companyId: string;
  invoiceId: string;
  customerId: string | null;
  paymentMethod: PaymentMethodType;
  providerCode: PaymentProviderCode | null;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  paidAt: string | null;
  createdAt: string;
};

export type PaymentIntentRequest = {
  companyId: string;
  invoiceId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  providerCode: PaymentProviderCode;
  returnUrl: string;
  idempotencyKey?: string;
};

export type PaymentIntentResult = {
  intentId: string;
  providerCode: PaymentProviderCode;
  checkoutUrl: string | null;
  providerIntentId: string | null;
  status: PaymentStatus;
};

export type RefundRequest = {
  companyId: string;
  invoiceId: string;
  paymentId?: string | null;
  amountCents: number;
  refundType: RefundType;
  reason?: string | null;
  createdBy?: string | null;
};

export type FinancialRefund = {
  id: string;
  companyId: string;
  invoiceId: string;
  amountCents: number;
  refundType: RefundType;
  status: RefundStatus;
  reason: string | null;
};

export type LedgerEntry = {
  id: string;
  companyId: string;
  entryType: LedgerEntryType;
  direction: LedgerDirection;
  amountCents: number;
  currency: string;
  referenceType: string;
  referenceId: string;
  description: string;
  createdAt: string;
};

export type PricingContext = {
  companyId: string;
  serviceId: string;
  resourceId?: string | null;
  branchId?: string | null;
  customerTier?: "standard" | "vip" | "insurance";
};

export type PricingResult = {
  priceCents: number;
  currency: string;
  ruleType: PricingRuleType | "service_default";
  ruleId?: string | null;
};

export type DiscountValidation = {
  valid: boolean;
  discountCents: number;
  discountId?: string;
  error?: string;
};

export type TaxCalculation = {
  taxCents: number;
  subtotalCents: number;
  totalCents: number;
  ratePercent: number;
  taxMode: TaxMode;
};

export type RevenueMetrics = {
  dailyCents: number;
  monthlyCents: number;
  yearlyCents: number;
  outstandingCents: number;
  refundCents: number;
  averageInvoiceCents: number;
  invoiceCount: number;
  paymentCount: number;
};

export type RevenueBreakdown = {
  dimension: "doctor" | "branch" | "service" | "provider";
  items: Array<{ id: string; name: string; amountCents: number; count: number }>;
};

export type CompanyFinancialSettings = {
  companyId: string;
  defaultPaymentProvider: PaymentProviderCode | null;
  invoicePrefix: string;
  defaultCurrency: string;
  autoInvoiceOnBooking: boolean;
  autoInvoiceOnCompletion: boolean;
  refundApprovalRequired: boolean;
};

export type InvoiceVersionSnapshot = {
  invoiceId: string;
  versionNumber: number;
  documentType: InvoiceDocumentType;
  snapshot: CustomerInvoice;
  reason?: string | null;
};

export type FinancialDashboardSummary = {
  revenue: RevenueMetrics;
  recentInvoices: CustomerInvoice[];
  recentPayments: CustomerPayment[];
  recentRefunds: FinancialRefund[];
  outstandingBalanceCents: number;
};

export type WebhookPayload = {
  providerCode: PaymentProviderCode;
  eventType: string;
  providerEventId?: string;
  idempotencyKey?: string;
  payload: unknown;
};

export type WebhookProcessResult = {
  processed: boolean;
  invoiceId?: string;
  paymentId?: string;
  error?: string;
};
