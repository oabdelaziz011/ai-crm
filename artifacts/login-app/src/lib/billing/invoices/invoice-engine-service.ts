import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateInvoiceInput, CustomerInvoice } from "@/lib/billing/types/financial-types";
import type { InvoiceLifecycleStatus } from "@/lib/billing/types/financial-enums";
import { CustomerInvoiceRepository } from "@/lib/billing/repositories/customer-invoice-repository";
import { TaxEngineService } from "@/lib/billing/taxes/tax-engine-service";
import { DiscountEngineService } from "@/lib/billing/discounts/discount-engine-service";
import { LedgerService } from "@/lib/billing/ledger/ledger-service";
import { sumCents } from "@/lib/billing/utilities/money";
import type { InvoicePdfGenerator } from "@/lib/billing/invoices/pdf-generator";
import { MinimalInvoicePdfGenerator } from "@/lib/billing/invoices/pdf-generator";
import { getEnterpriseEventPublisher } from "@/lib/integration/events/enterprise-event-publisher";

const VALID_TRANSITIONS: Record<InvoiceLifecycleStatus, InvoiceLifecycleStatus[]> = {
  draft: ["pending", "issued", "cancelled"],
  pending: ["issued", "cancelled"],
  issued: ["partially_paid", "paid", "cancelled"],
  partially_paid: ["paid", "cancelled", "refunded"],
  paid: ["refunded"],
  cancelled: [],
  refunded: [],
};

/** Enterprise invoice lifecycle engine. */
export class InvoiceEngineService {
  private readonly invoices: CustomerInvoiceRepository;
  private readonly taxEngine: TaxEngineService;
  private readonly discountEngine: DiscountEngineService;
  private readonly pdfGenerator: InvoicePdfGenerator;

  constructor(
    client: SupabaseClient,
    private readonly ledger: LedgerService,
    pdfGenerator: InvoicePdfGenerator = new MinimalInvoicePdfGenerator(),
  ) {
    this.invoices = new CustomerInvoiceRepository(client);
    this.taxEngine = new TaxEngineService(client);
    this.discountEngine = new DiscountEngineService(client);
    this.pdfGenerator = pdfGenerator;
  }

  async createDraft(input: CreateInvoiceInput, userId: string): Promise<CustomerInvoice> {
    const subtotalCents = sumCents(input.lineItems.map((li: { totalCents: number }) => li.totalCents));
    let discountCents = 0;
    let discountId: string | undefined;

    if (input.discountCode) {
      const discount = await this.discountEngine.validate(input.companyId, input.discountCode, subtotalCents);
      if (discount.valid) {
        discountCents = discount.discountCents;
        discountId = discount.discountId;
      }
    }

    const netSubtotal = subtotalCents - discountCents;
    const tax = await this.taxEngine.calculate(input.companyId, netSubtotal, input.taxMode ?? "exclusive");
    const currency = input.lineItems[0] ? "USD" : "USD";

    const invoice = await this.invoices.createDraft({
      ...input,
      subtotalCents: tax.subtotalCents,
      taxCents: tax.taxCents,
      discountCents,
      totalCents: tax.totalCents,
      currency,
      userId,
    });

    if (discountId && discountCents > 0) {
      await this.discountEngine.recordRedemption(input.companyId, discountId, invoice.id, discountCents);
      await this.ledger.recordDiscount({
        companyId: input.companyId,
        invoiceId: invoice.id,
        amountCents: discountCents,
        currency,
      });
    }

    if (input.bookingId) {
      await this.invoices.linkBooking(input.companyId, input.bookingId, invoice.id);
    }

    return invoice;
  }

  async issue(companyId: string, invoiceId: string): Promise<CustomerInvoice> {
    const invoice = await this.invoices.getById(companyId, invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    this.assertTransition(invoice.status, "issued");

    const invoiceNumber = await this.invoices.assignInvoiceNumber(companyId, invoiceId);

    await this.ledger.recordInvoiceIssued({
      companyId,
      invoiceId,
      amountCents: invoice.totalCents,
      currency: invoice.currency,
    });

    if (invoice.taxCents > 0) {
      await this.ledger.recordTax({
        companyId,
        invoiceId,
        amountCents: invoice.taxCents,
        currency: invoice.currency,
      });
    }

    const issued = { ...invoice, status: "issued" as const, invoiceNumber, issuedAt: new Date().toISOString() };

    await getEnterpriseEventPublisher().publish({
      companyId,
      eventType: "invoice.created",
      eventId: `${invoiceId}:invoice.created`,
      payload: {
        invoiceId,
        invoiceNumber,
        customerId: invoice.customerId,
        amountCents: Number(invoice.totalCents ?? 0),
        currency: invoice.currency || "USD",
        totalCents: invoice.totalCents,
      },
    });

    void this.generatePdf(companyId, invoiceId).catch((err) => {
      console.warn("[InvoiceEngineService] PDF generation failed:", err);
    });

    return issued;
  }

  async cancel(companyId: string, invoiceId: string): Promise<void> {
    const invoice = await this.invoices.getById(companyId, invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    this.assertTransition(invoice.status, "cancelled");
    await this.invoices.updateStatus(companyId, invoiceId, "cancelled", {
      cancelled_at: new Date().toISOString(),
    });
  }

  async markRefunded(companyId: string, invoiceId: string): Promise<void> {
    const invoice = await this.invoices.getById(companyId, invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    this.assertTransition(invoice.status, "refunded");
    await this.invoices.updateStatus(companyId, invoiceId, "refunded");
  }

  async generatePdf(companyId: string, invoiceId: string) {
    const invoice = await this.invoices.getById(companyId, invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    return this.pdfGenerator.generate(invoice);
  }

  async list(companyId: string, limit?: number): Promise<CustomerInvoice[]> {
    return this.invoices.listByCompany(companyId, limit);
  }

  async getById(companyId: string, invoiceId: string): Promise<CustomerInvoice | null> {
    return this.invoices.getById(companyId, invoiceId);
  }

  private assertTransition(from: InvoiceLifecycleStatus, to: InvoiceLifecycleStatus): void {
    if (!VALID_TRANSITIONS[from]?.includes(to)) {
      throw new Error(`Invalid invoice transition: ${from} → ${to}`);
    }
  }
}
