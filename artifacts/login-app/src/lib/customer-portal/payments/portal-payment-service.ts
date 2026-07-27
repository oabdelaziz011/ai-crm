import type { PortalPaymentProviderCode } from "@/lib/customer-portal/types/portal-enums";
import type { PortalPaymentView } from "@/lib/customer-portal/types";
import { PaymentProviderRegistry } from "@/lib/billing/providers/payment-provider-registry";
import type { PaymentProviderCode } from "@/lib/billing/types/financial-enums";

export type PaymentProviderContext = {
  companyId: string;
  customerId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  returnUrl: string;
};

export type PaymentProviderResult = {
  provider: PortalPaymentProviderCode;
  checkoutUrl: string | null;
  paymentIntentId: string | null;
  status: "pending" | "completed" | "failed";
};

/** Pluggable payment provider — business logic never depends on implementation. */
export interface PortalPaymentProvider {
  readonly code: PortalPaymentProviderCode;
  createPaymentRequest(context: PaymentProviderContext): Promise<PaymentProviderResult>;
  handleWebhook?(payload: unknown): Promise<{ invoiceId: string; status: string }>;
}

/** Delegates to billing PaymentProviderRegistry — single source of truth. */
class BillingPortalPaymentAdapter implements PortalPaymentProvider {
  constructor(
    private readonly registry: PaymentProviderRegistry,
    readonly code: PortalPaymentProviderCode,
  ) {}

  async createPaymentRequest(context: PaymentProviderContext): Promise<PaymentProviderResult> {
    const provider = this.registry.get(this.code as PaymentProviderCode);
    if (!provider) throw new Error(`Payment provider not registered: ${this.code}`);

    const result = await provider.createIntent({
      companyId: context.companyId,
      invoiceId: context.invoiceId,
      customerId: context.customerId,
      amountCents: context.amountCents,
      currency: context.currency,
      providerCode: this.code as PaymentProviderCode,
      returnUrl: context.returnUrl,
    });

    return {
      provider: this.code,
      checkoutUrl: result.checkoutUrl,
      paymentIntentId: result.providerIntentId ?? result.intentId,
      status: result.status === "completed" ? "completed" : result.status === "failed" ? "failed" : "pending",
    };
  }
}

export class PortalPaymentService {
  private readonly providers = new Map<PortalPaymentProviderCode, PortalPaymentProvider>();

  register(provider: PortalPaymentProvider): void {
    this.providers.set(provider.code, provider);
  }

  getProvider(code: PortalPaymentProviderCode): PortalPaymentProvider | null {
    return this.providers.get(code) ?? null;
  }

  async createPayment(
    code: PortalPaymentProviderCode,
    context: PaymentProviderContext,
  ): Promise<PaymentProviderResult> {
    const provider = this.providers.get(code);
    if (!provider) throw new Error(`Payment provider not registered: ${code}`);
    return provider.createPaymentRequest(context);
  }

  static createDefault(): PortalPaymentService {
    const service = new PortalPaymentService();
    const registry = PaymentProviderRegistry.createDefault();

    for (const code of ["sandbox", "stripe", "paymob", "fawry"] as const) {
      service.register(new BillingPortalPaymentAdapter(registry, code));
    }

    return service;
  }
}

export type PortalPaymentsHistory = {
  payments: PortalPaymentView[];
  outstandingBalanceCents: number;
};
