import type { LedgerRepository } from "@/lib/billing/ledger/ledger-repository";
import type { LedgerEntryType } from "@/lib/billing/types/financial-enums";

/** Immutable financial ledger — every financial event creates entries. */
export class LedgerService {
  constructor(private readonly repository: LedgerRepository) {}

  async recordInvoiceIssued(input: {
    companyId: string;
    invoiceId: string;
    amountCents: number;
    currency: string;
    createdBy?: string | null;
  }): Promise<string> {
    return this.repository.append({
      companyId: input.companyId,
      entryType: "invoice",
      direction: "debit",
      amountCents: input.amountCents,
      currency: input.currency,
      referenceType: "invoice",
      referenceId: input.invoiceId,
      description: "Invoice issued",
      createdBy: input.createdBy,
    });
  }

  async recordPayment(input: {
    companyId: string;
    paymentId: string;
    amountCents: number;
    currency: string;
    createdBy?: string | null;
  }): Promise<string> {
    return this.repository.append({
      companyId: input.companyId,
      entryType: "payment",
      direction: "credit",
      amountCents: input.amountCents,
      currency: input.currency,
      referenceType: "payment",
      referenceId: input.paymentId,
      description: "Payment received",
      createdBy: input.createdBy,
    });
  }

  async recordRefund(input: {
    companyId: string;
    refundId: string;
    amountCents: number;
    currency: string;
    createdBy?: string | null;
  }): Promise<string> {
    return this.repository.append({
      companyId: input.companyId,
      entryType: "refund",
      direction: "debit",
      amountCents: input.amountCents,
      currency: input.currency,
      referenceType: "refund",
      referenceId: input.refundId,
      description: "Refund processed",
      createdBy: input.createdBy,
    });
  }

  async recordDiscount(input: {
    companyId: string;
    invoiceId: string;
    amountCents: number;
    currency: string;
  }): Promise<string> {
    return this.repository.append({
      companyId: input.companyId,
      entryType: "discount",
      direction: "credit",
      amountCents: input.amountCents,
      currency: input.currency,
      referenceType: "invoice",
      referenceId: input.invoiceId,
      description: "Discount applied",
    });
  }

  async recordTax(input: {
    companyId: string;
    invoiceId: string;
    amountCents: number;
    currency: string;
  }): Promise<string> {
    return this.repository.append({
      companyId: input.companyId,
      entryType: "tax",
      direction: "credit",
      amountCents: input.amountCents,
      currency: input.currency,
      referenceType: "invoice",
      referenceId: input.invoiceId,
      description: "Tax collected",
    });
  }

  async recordAdjustment(input: {
    companyId: string;
    referenceId: string;
    amountCents: number;
    currency: string;
    direction: "debit" | "credit";
    description: string;
  }): Promise<string> {
    return this.repository.append({
      companyId: input.companyId,
      entryType: "adjustment" as LedgerEntryType,
      direction: input.direction,
      amountCents: input.amountCents,
      currency: input.currency,
      referenceType: "adjustment",
      referenceId: input.referenceId,
      description: input.description,
    });
  }
}
