import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentReadPort, PaymentReadModel } from "@workspace/application-layer";
import { CustomerPaymentRepository } from "@/lib/billing/repositories/customer-payment-repository";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

export function createLoginAppPaymentReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): PaymentReadPort {
  const repository = new CustomerPaymentRepository(client);

  return {
    async getById(tenantId, paymentId) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("invoices.view")) return null;
      const { data, error } = await client
        .from("customer_payments")
        .select("*")
        .eq("company_id", tenantId)
        .eq("id", paymentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return Object.freeze({
        id: String(data.id),
        tenantId,
        customerId: data.customer_id ? String(data.customer_id) : "",
        amountCents: Number(data.amount_cents),
        currency: String(data.currency ?? "USD"),
        method: String(data.payment_method ?? "unknown"),
        collectedAt: data.paid_at ? String(data.paid_at) : String(data.created_at),
      });
    },

    async listForCustomer(tenantId, customerId) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("invoices.view")) return [];
      const payments = await repository.listByCompany(tenantId, 100);
      return payments
        .filter((payment) => payment.customerId === customerId && payment.status === "completed")
        .map(
          (payment): PaymentReadModel =>
            Object.freeze({
              id: payment.id,
              tenantId,
              customerId: payment.customerId ?? "",
              amountCents: payment.amountCents,
              currency: payment.currency,
              method: String(payment.paymentMethod),
              collectedAt: payment.paidAt ?? payment.createdAt,
            }),
        );
    },
  };
}
