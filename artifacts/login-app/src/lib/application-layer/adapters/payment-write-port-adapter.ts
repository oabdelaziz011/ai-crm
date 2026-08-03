import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentWritePort, PaymentReadModel } from "@workspace/application-layer";
import type { PaymentMethodType } from "@/lib/billing/types/financial-enums";
import { CustomerPaymentRepository } from "@/lib/billing/repositories/customer-payment-repository";
import { CustomerInvoiceRepository } from "@/lib/billing/repositories/customer-invoice-repository";
import { getFinancialPlatformServices } from "@/lib/billing/services/financial-platform-service";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function mapPaymentMethod(method: string): PaymentMethodType {
  const normalized = method.toLowerCase();
  if (normalized === "cash" || normalized === "card" || normalized === "bank_transfer" || normalized === "wallet" || normalized === "online" || normalized === "mixed") {
    return normalized;
  }
  return "cash";
}

function canCollectPayment(ctx: LoginAppPortContext): boolean {
  return ctx.isSuperAdmin || ctx.hasPermission("invoices.create") || ctx.hasPermission("operations.payment.collect");
}

export function createLoginAppPaymentWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): PaymentWritePort {
  const payments = new CustomerPaymentRepository(client);
  const invoices = new CustomerInvoiceRepository(client);
  const financial = getFinancialPlatformServices();

  return {
    async collect(input) {
      if (input.tenantId !== ctx.companyId || !canCollectPayment(ctx)) {
        throw new Error("Permission denied");
      }

      let invoiceId = input.invoiceId;
      if (!invoiceId) {
        const customerInvoices = (await invoices.listByCompany(input.tenantId, 200)).filter(
          (invoice) => invoice.customerId === input.customerId,
        );
        const outstanding = customerInvoices.find(
          (invoice) => invoice.totalCents > invoice.paidCents && invoice.status !== "cancelled",
        );
        if (!outstanding) throw new Error("No outstanding invoice found for customer");
        invoiceId = outstanding.id;
      }

      const invoice = await invoices.getById(input.tenantId, invoiceId);
      if (!invoice) throw new Error("Invoice not found");

      const payment = await payments.create({
        companyId: input.tenantId,
        invoiceId,
        customerId: input.customerId,
        paymentMethod: mapPaymentMethod(input.method),
        amountCents: input.amountCents,
        currency: input.currency,
        createdBy: ctx.actorUserId,
      });

      await financial.payments.confirmPayment(input.tenantId, payment.id);

      return Object.freeze({
        id: payment.id,
        tenantId: input.tenantId,
        customerId: input.customerId,
        amountCents: input.amountCents,
        currency: input.currency,
        method: input.method,
        collectedAt: new Date().toISOString(),
      } satisfies PaymentReadModel);
    },

    async refund(tenantId, paymentId, amountCents, reason) {
      if (tenantId !== ctx.companyId || !canCollectPayment(ctx)) {
        throw new Error("Permission denied");
      }

      const { data: paymentRow, error } = await client
        .from("customer_payments")
        .select("invoice_id, customer_id, currency")
        .eq("company_id", tenantId)
        .eq("id", paymentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!paymentRow) throw new Error("Payment not found");

      await financial.refunds.requestRefund({
        companyId: tenantId,
        invoiceId: String(paymentRow.invoice_id),
        paymentId,
        amountCents,
        refundType: "manual",
        reason: reason ?? "Refund",
        createdBy: ctx.actorUserId,
      });

      return Object.freeze({
        id: paymentId,
        tenantId,
        customerId: paymentRow.customer_id ? String(paymentRow.customer_id) : "",
        amountCents,
        currency: String(paymentRow.currency ?? "USD"),
        method: "refund",
        collectedAt: new Date().toISOString(),
      } satisfies PaymentReadModel);
    },
  };
}
