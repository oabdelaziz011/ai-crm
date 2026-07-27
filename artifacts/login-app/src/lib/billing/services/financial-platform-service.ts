import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { LedgerRepository } from "@/lib/billing/ledger/ledger-repository";
import { LedgerService } from "@/lib/billing/ledger/ledger-service";
import { InvoiceEngineService } from "@/lib/billing/invoices/invoice-engine-service";
import { PaymentProviderRegistry } from "@/lib/billing/providers/payment-provider-registry";
import { PaymentService, WebhookHandler } from "@/lib/billing/payments/payment-service";
import { RefundEngineService } from "@/lib/billing/refunds/refund-engine-service";
import { RevenueReportService } from "@/lib/billing/reports/revenue-report-service";
import { PricingEngineService } from "@/lib/billing/pricing/pricing-engine-service";
import { TaxEngineService } from "@/lib/billing/taxes/tax-engine-service";
import { DiscountEngineService } from "@/lib/billing/discounts/discount-engine-service";
import { TenantSubscriptionEngine } from "@/lib/billing/subscriptions/tenant-subscription-engine";
import { StorageInvoicePdfGenerator } from "@/lib/billing/invoices/pdf-generator";

export type FinancialPlatformServices = {
  invoices: InvoiceEngineService;
  payments: PaymentService;
  webhooks: WebhookHandler;
  refunds: RefundEngineService;
  ledger: LedgerService;
  reports: RevenueReportService;
  pricing: PricingEngineService;
  taxes: TaxEngineService;
  discounts: DiscountEngineService;
  subscriptions: TenantSubscriptionEngine;
  providers: PaymentProviderRegistry;
};

export function createFinancialPlatformServices(client: SupabaseClient = supabase): FinancialPlatformServices {
  const ledgerRepo = new LedgerRepository(client);
  const ledger = new LedgerService(ledgerRepo);
  const providers = PaymentProviderRegistry.createDefault();
  const invoices = new InvoiceEngineService(client, ledger, new StorageInvoicePdfGenerator(client));
  const payments = new PaymentService(client, providers, ledger);
  const webhooks = new WebhookHandler(client, providers, payments);
  const refunds = new RefundEngineService(client, ledger, invoices);

  return {
    invoices,
    payments,
    webhooks,
    refunds,
    ledger,
    reports: new RevenueReportService(client),
    pricing: new PricingEngineService(client),
    taxes: new TaxEngineService(client),
    discounts: new DiscountEngineService(client),
    subscriptions: new TenantSubscriptionEngine(client),
    providers,
  };
}

let cached: FinancialPlatformServices | null = null;

export function getFinancialPlatformServices(): FinancialPlatformServices {
  if (!cached) cached = createFinancialPlatformServices();
  return cached;
}
