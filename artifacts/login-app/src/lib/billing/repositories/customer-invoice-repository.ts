import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerInvoice, CreateInvoiceInput, InvoiceLineItem } from "@/lib/billing/types/financial-types";
import type { InvoiceLifecycleStatus } from "@/lib/billing/types/financial-enums";

function mapLineItem(row: Record<string, unknown>): InvoiceLineItem {
  return {
    id: String(row.id),
    description: String(row.description),
    quantity: Number(row.quantity),
    unitPriceCents: Number(row.unit_price_cents),
    taxCents: Number(row.tax_cents),
    discountCents: Number(row.discount_cents),
    totalCents: Number(row.total_cents),
    serviceId: row.service_id ? String(row.service_id) : null,
    resourceId: row.resource_id ? String(row.resource_id) : null,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapInvoice(row: Record<string, unknown>, lineItems: InvoiceLineItem[] = []): CustomerInvoice {
  return {
    id: String(row.id),
    companyId: String(row.company_id ?? ""),
    customerId: row.customer_id ? String(row.customer_id) : null,
    bookingId: row.booking_id ? String(row.booking_id) : null,
    invoiceNumber: row.invoice_number ? String(row.invoice_number) : null,
    status: row.status as InvoiceLifecycleStatus,
    currency: String(row.currency ?? "USD"),
    subtotalCents: Number(row.subtotal_cents ?? 0),
    taxCents: Number(row.tax_cents ?? 0),
    discountCents: Number(row.discount_cents ?? 0),
    totalCents: Number(row.total_cents ?? 0),
    paidCents: Number(row.paid_cents ?? 0),
    version: Number(row.version ?? 1),
    taxMode: (row.tax_mode as CustomerInvoice["taxMode"]) ?? "exclusive",
    branchId: row.branch_id ? String(row.branch_id) : null,
    notes: row.notes ? String(row.notes) : null,
    issuedAt: row.issued_at
      ? String(row.issued_at)
      : row.invoice_date
        ? String(row.invoice_date)
        : null,
    // Legacy CRM rows often only have invoice_date; surface it as due when due_at is empty.
    dueAt: row.due_at
      ? String(row.due_at)
      : row.invoice_date
        ? String(row.invoice_date)
        : null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    lineItems,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class CustomerInvoiceRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getById(companyId: string, invoiceId: string): Promise<CustomerInvoice | null> {
    const { data, error } = await this.client
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    const lineItems = await this.listLineItems(invoiceId);
    return mapInvoice(data, lineItems);
  }

  async listByCompany(companyId: string, limit = 50): Promise<CustomerInvoice[]> {
    const { data, error } = await this.client
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)
      .eq("invoice_type", "customer")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapInvoice(row));
  }

  async createDraft(
    input: CreateInvoiceInput & {
      subtotalCents: number;
      taxCents: number;
      discountCents: number;
      totalCents: number;
      currency: string;
      userId: string;
    },
  ): Promise<CustomerInvoice> {
    const { data, error } = await this.client
      .from("invoices")
      .insert({
        user_id: input.userId,
        company_id: input.companyId,
        customer_id: input.customerId,
        booking_id: input.bookingId ?? null,
        branch_id: input.branchId ?? null,
        invoice_type: "customer",
        status: "draft",
        currency: input.currency,
        subtotal_cents: input.subtotalCents,
        tax_cents: input.taxCents,
        discount_cents: input.discountCents,
        total_cents: input.totalCents,
        amount: input.totalCents / 100,
        tax_mode: input.taxMode ?? "exclusive",
        notes: input.notes ?? null,
        due_at: input.dueAt ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const lineItems = await this.insertLineItems(String(data.id), input.companyId, input.lineItems);
    return mapInvoice(data, lineItems);
  }

  async updateStatus(
    companyId: string,
    invoiceId: string,
    status: InvoiceLifecycleStatus,
    patch: Record<string, unknown> = {},
  ): Promise<void> {
    const { error } = await this.client
      .from("invoices")
      .update({ status, ...patch, updated_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
  }

  async assignInvoiceNumber(companyId: string, invoiceId: string): Promise<string> {
    const { data, error } = await this.client.rpc("financial_next_invoice_number", {
      p_company_id: companyId,
    });
    if (error) throw new Error(error.message);
    const invoiceNumber = String(data);
    await this.updateStatus(companyId, invoiceId, "issued", {
      invoice_number: invoiceNumber,
      issued_at: new Date().toISOString(),
    });
    return invoiceNumber;
  }

  async recordPayment(companyId: string, invoiceId: string, paidCents: number, totalCents: number): Promise<void> {
    const newPaid = paidCents;
    const status: InvoiceLifecycleStatus =
      newPaid >= totalCents ? "paid" : newPaid > 0 ? "partially_paid" : "issued";
    await this.updateStatus(companyId, invoiceId, status, {
      paid_cents: newPaid,
      paid_at: status === "paid" ? new Date().toISOString() : null,
      amount: totalCents / 100,
    });
  }

  async linkBooking(companyId: string, bookingId: string, invoiceId: string): Promise<void> {
    const { error: bookingError } = await this.client
      .from("scheduling_bookings")
      .update({ invoice_id: invoiceId })
      .eq("id", bookingId)
      .eq("company_id", companyId);
    if (bookingError) throw new Error(bookingError.message);
  }

  private async listLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
    const { data, error } = await this.client
      .from("customer_invoice_line_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapLineItem);
  }

  private async insertLineItems(
    invoiceId: string,
    companyId: string,
    items: Omit<InvoiceLineItem, "id">[],
  ): Promise<InvoiceLineItem[]> {
    if (items.length === 0) return [];
    const rows = items.map((item, index) => ({
      invoice_id: invoiceId,
      company_id: companyId,
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      tax_cents: item.taxCents,
      discount_cents: item.discountCents,
      total_cents: item.totalCents,
      service_id: item.serviceId ?? null,
      resource_id: item.resourceId ?? null,
      sort_order: item.sortOrder ?? index,
    }));
    const { data, error } = await this.client
      .from("customer_invoice_line_items")
      .insert(rows)
      .select("*");
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapLineItem);
  }
}
