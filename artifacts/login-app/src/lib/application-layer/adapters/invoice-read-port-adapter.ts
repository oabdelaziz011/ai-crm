import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceReadPort, InvoiceReadModel } from "@workspace/application-layer";
import { CustomerInvoiceRepository } from "@/lib/billing/repositories/customer-invoice-repository";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

export function createLoginAppInvoiceReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): InvoiceReadPort {
  const repository = new CustomerInvoiceRepository(client);

  return {
    async getById(tenantId, invoiceId) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("invoices.view")) return null;
      const invoice = await repository.getById(tenantId, invoiceId);
      if (!invoice) return null;
      return Object.freeze({
        id: invoice.id,
        tenantId,
        customerId: invoice.customerId ?? "",
        amountCents: invoice.totalCents,
        currency: invoice.currency,
        generatedAt: invoice.issuedAt ?? invoice.createdAt,
        status: String(invoice.status),
        number: invoice.invoiceNumber ?? undefined,
      });
    },

    async listForCustomer(tenantId, customerId) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("invoices.view")) return [];
      const invoices = await repository.listByCompany(tenantId, 100);
      return invoices
        .filter((inv) => inv.customerId === customerId)
        .map(
          (invoice): InvoiceReadModel =>
            Object.freeze({
              id: invoice.id,
              tenantId,
              customerId: invoice.customerId ?? "",
              amountCents: invoice.totalCents,
              currency: invoice.currency,
              generatedAt: invoice.issuedAt ?? invoice.createdAt,
              status: String(invoice.status),
              number: invoice.invoiceNumber ?? undefined,
            }),
        );
    },
  };
}
