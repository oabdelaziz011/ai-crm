import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentWritePort, PaymentReadModel } from "@workspace/application-layer";
import type { PaymentMethodType } from "@/lib/billing/types/financial-enums";
import { CustomerPaymentRepository } from "@/lib/billing/repositories/customer-payment-repository";
import { CustomerInvoiceRepository } from "@/lib/billing/repositories/customer-invoice-repository";
import { getFinancialPlatformServices } from "@/lib/billing/services/financial-platform-service";
import { BookingRepository } from "@/lib/scheduling/booking-domain/booking-repository";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";
import { createLoginAppEntityActivityWritePort } from "./entity-port-adapters";

function mapPaymentMethod(method: string): PaymentMethodType {
  const normalized = method.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "cash" || normalized === "card" || normalized === "wallet" || normalized === "online" || normalized === "mixed") {
    return normalized;
  }
  if (normalized === "transfer" || normalized === "bank_transfer") return "bank_transfer";
  if (normalized === "other") return "mixed";
  return "cash";
}

function canCollectPayment(ctx: LoginAppPortContext): boolean {
  return (
    ctx.isSuperAdmin ||
    ctx.hasPermission("invoices.create") ||
    ctx.hasPermission("operations.write") ||
    ctx.hasPermission("operations.payment.collect")
  );
}

function resolveBookingPaymentStatus(
  finalAmountCents: number,
  collectedCents: number,
): "pending" | "partial" | "paid" {
  if (collectedCents <= 0) return "pending";
  if (collectedCents >= finalAmountCents) return "paid";
  return "partial";
}

export function createLoginAppPaymentWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): PaymentWritePort {
  const payments = new CustomerPaymentRepository(client);
  const invoices = new CustomerInvoiceRepository(client);
  const bookings = new BookingRepository(client);
  const financial = getFinancialPlatformServices();
  const activities = createLoginAppEntityActivityWritePort(client, ctx);

  return {
    async collect(input) {
      if (input.tenantId !== ctx.companyId || !canCollectPayment(ctx)) {
        throw new Error("Permission denied");
      }

      const discountCents = Math.max(0, Number(input.discountCents) || 0);
      const taxCents = Math.max(0, Number(input.taxCents) || 0);
      const servicePriceCents = Math.max(
        0,
        Number(input.servicePriceCents) || Number(input.amountCents) || 0,
      );
      const finalAmountCents = Math.max(0, servicePriceCents - discountCents + taxCents);
      const collectAmountCents = Math.max(0, Number(input.amountCents) || finalAmountCents);
      const description = input.serviceDescription?.trim() || "Service";

      let invoiceId = input.invoiceId;
      if (!invoiceId && input.bookingId) {
        const booking = await bookings.getById(input.bookingId, input.tenantId);
        if (booking?.invoice_id) invoiceId = booking.invoice_id;
      }

      if (!invoiceId) {
        const customerInvoices = (await invoices.listByCompany(input.tenantId, 200)).filter(
          (invoice) => invoice.customerId === input.customerId,
        );
        const outstanding = customerInvoices.find(
          (invoice) => invoice.totalCents > invoice.paidCents && invoice.status !== "cancelled",
        );
        if (outstanding && !input.bookingId) {
          invoiceId = outstanding.id;
        } else {
          // Reuse invoice engine — final amount is the payable total (tax/discount captured on booking).
          const draft = await financial.invoices.createDraft(
            {
              companyId: input.tenantId,
              customerId: input.customerId,
              bookingId: input.bookingId ?? null,
              lineItems: [
                {
                  description,
                  quantity: 1,
                  unitPriceCents: finalAmountCents,
                  taxCents: 0,
                  discountCents: 0,
                  totalCents: finalAmountCents,
                },
              ],
              taxMode: "exempt",
              dueAt: null,
              createdBy: ctx.actorUserId,
            },
            ctx.actorUserId,
          );
          const issued = await financial.invoices.issue(input.tenantId, draft.id);
          invoiceId = issued.id;
        }
      }

      const invoice = await invoices.getById(input.tenantId, invoiceId);
      if (!invoice) throw new Error("Invoice not found");

      const payment = await payments.create({
        companyId: input.tenantId,
        invoiceId,
        customerId: input.customerId,
        paymentMethod: mapPaymentMethod(input.method),
        amountCents: collectAmountCents,
        currency: input.currency,
        createdBy: ctx.actorUserId,
      });

      await financial.payments.confirmPayment(input.tenantId, payment.id);

      const refreshed = await invoices.getById(input.tenantId, invoiceId);
      const paidCents = refreshed?.paidCents ?? collectAmountCents;
      const totalCents = refreshed?.totalCents ?? finalAmountCents;
      const bookingPaymentStatus = resolveBookingPaymentStatus(totalCents, paidCents);

      if (input.bookingId) {
        await bookings.updatePaymentState(input.bookingId, input.tenantId, {
          invoiceId,
          paymentStatus: bookingPaymentStatus,
          discountCents,
          taxCents,
          updatedBy: ctx.actorUserId,
        });
      }

      const amountLabel = (collectAmountCents / 100).toFixed(2);
      // Shared entity timeline (CRM + Ops Entity Workspace) — same entity_activities table.
      try {
        await activities.create({
          tenantId: input.tenantId,
          entityType: "customer",
          entityId: input.customerId,
          activityType: "payment",
          subject: "Payment collected",
          body: `${amountLabel} ${input.currency} via ${input.method}`,
          actorId: ctx.actorUserId,
          relatedEntityType: input.bookingId ? "booking" : "invoice",
          relatedEntityId: input.bookingId ?? invoiceId,
          attachments: [
            {
              sourceModule: "operations",
              old_value: "pending",
              new_value: bookingPaymentStatus,
            },
          ],
          actorUserId: ctx.actorUserId,
        });
      } catch {
        // Payment already committed — timeline write must not roll it back.
      }

      return Object.freeze({
        id: payment.id,
        tenantId: input.tenantId,
        customerId: input.customerId,
        amountCents: collectAmountCents,
        currency: input.currency,
        method: input.method,
        collectedAt: new Date().toISOString(),
        invoiceId,
        bookingId: input.bookingId,
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
        refundType: "partial",
        reason: reason ?? null,
        createdBy: ctx.actorUserId,
      });

      return Object.freeze({
        id: paymentId,
        tenantId,
        customerId: String(paymentRow.customer_id),
        amountCents,
        currency: String(paymentRow.currency ?? "USD"),
        method: "refund",
        collectedAt: new Date().toISOString(),
        invoiceId: String(paymentRow.invoice_id),
      } satisfies PaymentReadModel);
    },
  };
}
