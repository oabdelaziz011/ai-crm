import { getFinancialPlatformServices } from "@/lib/billing/services/financial-platform-service";
import { CustomerPaymentRepository } from "@/lib/billing/repositories/customer-payment-repository";
import { supabase } from "@/lib/supabase";
import type { PaymentMethodType } from "@/lib/billing/types/financial-enums";

/** Record a manual customer payment via the financial platform (create + confirm). */
export async function recordManualCustomerPayment(input: {
  companyId: string;
  invoiceId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  paymentMethod: PaymentMethodType;
  createdBy?: string | null;
}): Promise<{ paymentId: string }> {
  const services = getFinancialPlatformServices();
  const repo = new CustomerPaymentRepository(supabase);
  const created = await repo.create({
    companyId: input.companyId,
    invoiceId: input.invoiceId,
    customerId: input.customerId,
    paymentMethod: input.paymentMethod,
    amountCents: input.amountCents,
    currency: input.currency,
    createdBy: input.createdBy ?? null,
    idempotencyKey: `manual:${input.invoiceId}:${input.amountCents}:${Date.now()}`,
  });
  await services.payments.confirmPayment(input.companyId, created.id);
  return { paymentId: created.id };
}
