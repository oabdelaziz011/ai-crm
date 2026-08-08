import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceWritePort, InvoiceReadModel } from "@workspace/application-layer";
import { getFinancialPlatformServices } from "@/lib/billing/services/financial-platform-service";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function canGenerateInvoice(ctx: LoginAppPortContext): boolean {
  return ctx.isSuperAdmin || ctx.hasPermission("invoices.create") || ctx.hasPermission("operations.write");
}

export function createLoginAppInvoiceWritePort(
  _client: SupabaseClient,
  ctx: LoginAppPortContext,
): InvoiceWritePort {
  const financial = getFinancialPlatformServices();

  return {
    async generate(input) {
      if (input.tenantId !== ctx.companyId || !canGenerateInvoice(ctx)) {
        throw new Error("Permission denied");
      }

      const draft = await financial.invoices.createDraft(
        {
          companyId: input.tenantId,
          customerId: input.customerId,
          lineItems: [
            {
              description: "Service",
              quantity: 1,
              unitPriceCents: input.amountCents,
              taxCents: 0,
              discountCents: 0,
              totalCents: input.amountCents,
            },
          ],
          dueAt: input.dueAt ?? null,
          createdBy: ctx.actorUserId,
        },
        ctx.actorUserId,
      );

      const issued = await financial.invoices.issue(input.tenantId, draft.id);

      return Object.freeze({
        id: issued.id,
        tenantId: input.tenantId,
        customerId: input.customerId,
        amountCents: issued.totalCents,
        currency: issued.currency,
        generatedAt: issued.issuedAt ?? issued.createdAt,
        status: String(issued.status),
        number: issued.invoiceNumber ?? undefined,
      } satisfies InvoiceReadModel);
    },
  };
}
