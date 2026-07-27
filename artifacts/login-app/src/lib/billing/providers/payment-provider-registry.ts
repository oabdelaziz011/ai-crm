import type { PaymentProviderCode } from "@/lib/billing/types/financial-enums";
import type { PaymentIntentRequest, PaymentIntentResult } from "@/lib/billing/types/financial-types";
import { isProdRuntime, readClientEnv } from "@/lib/runtime-env";
import { StripeFinancialProvider } from "@/lib/billing/providers/stripe-financial-provider";
import { PaymobFinancialProvider } from "@/lib/billing/providers/paymob-financial-provider";
import { FawryFinancialProvider } from "@/lib/billing/providers/fawry-financial-provider";

export type ProviderPaymentContext = PaymentIntentRequest;

/** Pluggable payment provider — no hardcoded implementations in business logic. */
export interface FinancialPaymentProvider {
  readonly code: PaymentProviderCode;
  createIntent(context: ProviderPaymentContext): Promise<PaymentIntentResult>;
  verifyWebhookSignature?(payload: string, signature: string, secret: string): boolean;
  parseWebhook?(payload: unknown): { intentId: string; status: "completed" | "failed"; providerPaymentId?: string };
}

export class SandboxFinancialProvider implements FinancialPaymentProvider {
  readonly code = "sandbox" as const;

  async createIntent(context: ProviderPaymentContext): Promise<PaymentIntentResult> {
    if (isProdRuntime() && readClientEnv("VITE_ALLOW_SANDBOX_PAYMENTS") !== "true") {
      throw new Error("Sandbox payments disabled in production");
    }
    return {
      intentId: `sandbox_${context.invoiceId}`,
      providerCode: "sandbox",
      checkoutUrl: `${context.returnUrl}?sandbox=1&invoice=${context.invoiceId}`,
      providerIntentId: `sandbox_pi_${context.invoiceId}`,
      status: "pending",
    };
  }

  parseWebhook(payload: unknown): { intentId: string; status: "completed" | "failed"; providerPaymentId?: string } {
    const p = payload as Record<string, string>;
    return {
      intentId: p.intentId ?? "",
      status: p.status === "failed" ? "failed" : "completed",
      providerPaymentId: p.providerPaymentId,
    };
  }
}

/** Provider registry — tenant selects provider via company_financial_settings. */
export class PaymentProviderRegistry {
  private readonly providers = new Map<PaymentProviderCode, FinancialPaymentProvider>();

  register(provider: FinancialPaymentProvider): void {
    this.providers.set(provider.code, provider);
  }

  get(code: PaymentProviderCode): FinancialPaymentProvider | null {
    return this.providers.get(code) ?? null;
  }

  list(): PaymentProviderCode[] {
    return [...this.providers.keys()];
  }

  static createDefault(): PaymentProviderRegistry {
    const registry = new PaymentProviderRegistry();
    registry.register(new SandboxFinancialProvider());
    registry.register(new StripeFinancialProvider());
    registry.register(new PaymobFinancialProvider());
    registry.register(new FawryFinancialProvider());
    return registry;
  }
}
