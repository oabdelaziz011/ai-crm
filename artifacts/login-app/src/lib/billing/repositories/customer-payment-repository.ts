import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPayment } from "@/lib/billing/types/financial-types";
import type { PaymentMethodType, PaymentStatus, PaymentProviderCode } from "@/lib/billing/types/financial-enums";

function mapPayment(row: Record<string, unknown>): CustomerPayment {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    invoiceId: String(row.invoice_id),
    customerId: row.customer_id ? String(row.customer_id) : null,
    paymentMethod: row.payment_method as PaymentMethodType,
    providerCode: row.provider_code as PaymentProviderCode | null,
    amountCents: Number(row.amount_cents),
    currency: String(row.currency ?? "USD"),
    status: row.status as PaymentStatus,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    createdAt: String(row.created_at),
  };
}

export class CustomerPaymentRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: {
    companyId: string;
    invoiceId: string;
    customerId: string;
    paymentMethod: PaymentMethodType;
    providerCode?: PaymentProviderCode | null;
    amountCents: number;
    currency: string;
    idempotencyKey?: string;
    createdBy?: string | null;
  }): Promise<CustomerPayment> {
    const { data, error } = await this.client
      .from("customer_payments")
      .insert({
        company_id: input.companyId,
        invoice_id: input.invoiceId,
        customer_id: input.customerId,
        payment_method: input.paymentMethod,
        provider_code: input.providerCode ?? null,
        amount_cents: input.amountCents,
        currency: input.currency,
        status: "pending",
        idempotency_key: input.idempotencyKey ?? null,
        created_by: input.createdBy ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapPayment(data);
  }

  async markCompleted(paymentId: string, providerPaymentId?: string | null): Promise<CustomerPayment> {
    const { data, error } = await this.client
      .from("customer_payments")
      .update({
        status: "completed",
        paid_at: new Date().toISOString(),
        provider_payment_id: providerPaymentId ?? null,
      })
      .eq("id", paymentId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapPayment(data);
  }

  async listByCompany(companyId: string, limit = 50): Promise<CustomerPayment[]> {
    const { data, error } = await this.client
      .from("customer_payments")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapPayment);
  }

  async getByIdempotencyKey(companyId: string, key: string): Promise<CustomerPayment | null> {
    const { data, error } = await this.client
      .from("customer_payments")
      .select("*")
      .eq("company_id", companyId)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapPayment(data) : null;
  }
}
