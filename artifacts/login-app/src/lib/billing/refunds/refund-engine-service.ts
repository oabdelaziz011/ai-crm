import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinancialRefund, RefundRequest } from "@/lib/billing/types/financial-types";
import type { RefundStatus } from "@/lib/billing/types/financial-enums";
import { CustomerInvoiceRepository } from "@/lib/billing/repositories/customer-invoice-repository";
import { LedgerService } from "@/lib/billing/ledger/ledger-service";
import { InvoiceEngineService } from "@/lib/billing/invoices/invoice-engine-service";

function mapRefund(row: Record<string, unknown>): FinancialRefund {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    invoiceId: String(row.invoice_id),
    amountCents: Number(row.amount_cents),
    refundType: row.refund_type as FinancialRefund["refundType"],
    status: row.status as RefundStatus,
    reason: row.reason ? String(row.reason) : null,
  };
}

/** Refund engine with approval workflow and cancellation policy support. */
export class RefundEngineService {
  private readonly invoices: CustomerInvoiceRepository;

  constructor(
    private readonly client: SupabaseClient,
    private readonly ledger: LedgerService,
    private readonly invoiceEngine: InvoiceEngineService,
  ) {
    this.invoices = new CustomerInvoiceRepository(client);
  }

  async requestRefund(input: RefundRequest): Promise<FinancialRefund> {
    const invoice = await this.invoices.getById(input.companyId, input.invoiceId);
    if (!invoice) throw new Error("Invoice not found");

    const maxRefundable = invoice.paidCents;
    if (input.amountCents > maxRefundable) {
      throw new Error("Refund amount exceeds paid amount");
    }

    const { data: settings } = await this.client
      .from("company_financial_settings")
      .select("refund_approval_required")
      .eq("company_id", input.companyId)
      .maybeSingle();

    const approvalRequired = Boolean(settings?.refund_approval_required) || input.refundType === "manual";

    const { data, error } = await this.client
      .from("financial_refunds")
      .insert({
        company_id: input.companyId,
        invoice_id: input.invoiceId,
        payment_id: input.paymentId ?? null,
        amount_cents: input.amountCents,
        currency: invoice.currency,
        refund_type: input.refundType,
        status: approvalRequired ? "pending" : "approved",
        reason: input.reason ?? null,
        approval_required: approvalRequired,
        created_by: input.createdBy ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (!approvalRequired) {
      await this.processRefund(String(data.id), input.companyId);
    }

    return mapRefund(data);
  }

  async approveRefund(companyId: string, refundId: string, approvedBy: string): Promise<FinancialRefund> {
    const { data, error } = await this.client
      .from("financial_refunds")
      .update({
        status: "approved",
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      })
      .eq("id", refundId)
      .eq("company_id", companyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await this.processRefund(refundId, companyId);
    return mapRefund(data);
  }

  async processRefund(refundId: string, companyId: string): Promise<void> {
    const { data: refund, error } = await this.client
      .from("financial_refunds")
      .select("*")
      .eq("id", refundId)
      .eq("company_id", companyId)
      .single();
    if (error || !refund) throw new Error("Refund not found");

    await this.client
      .from("financial_refunds")
      .update({ status: "processing" })
      .eq("id", refundId);

    await this.ledger.recordRefund({
      companyId,
      refundId,
      amountCents: Number(refund.amount_cents),
      currency: String(refund.currency ?? "USD"),
    });

    const invoice = await this.invoices.getById(companyId, String(refund.invoice_id));
    if (invoice) {
      const remainingPaid = invoice.paidCents - Number(refund.amount_cents);
      if (remainingPaid <= 0) {
        await this.invoiceEngine.markRefunded(companyId, invoice.id);
      } else {
        await this.invoices.recordPayment(companyId, invoice.id, remainingPaid, invoice.totalCents);
      }
    }

    await this.client
      .from("financial_refunds")
      .update({ status: "completed", processed_at: new Date().toISOString() })
      .eq("id", refundId);

    await this.client.from("financial_audit_log").insert({
      company_id: companyId,
      action: "refund.completed",
      entity_type: "refund",
      entity_id: refundId,
    });
  }

  async listByCompany(companyId: string, limit = 50): Promise<FinancialRefund[]> {
    const { data, error } = await this.client
      .from("financial_refunds")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRefund);
  }
}
