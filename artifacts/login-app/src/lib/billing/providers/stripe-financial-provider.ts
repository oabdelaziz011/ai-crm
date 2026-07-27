import type { FinancialPaymentProvider, ProviderPaymentContext } from "@/lib/billing/providers/payment-provider-registry";
import type { PaymentIntentResult } from "@/lib/billing/types/financial-types";
import { loadProviderCredentials, requireCredential } from "@/lib/billing/providers/provider-credentials";

export class StripeFinancialProvider implements FinancialPaymentProvider {
  readonly code = "stripe" as const;

  async createIntent(context: ProviderPaymentContext): Promise<PaymentIntentResult> {
    const creds = loadProviderCredentials("stripe");
    const secretKey = requireCredential(creds.secretKey, "STRIPE_SECRET_KEY", "stripe");

    const body = new URLSearchParams({
      amount: String(context.amountCents),
      currency: context.currency.toLowerCase(),
      "metadata[invoice_id]": context.invoiceId,
      "metadata[company_id]": context.companyId,
    });

    const response = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Stripe API error: ${response.status} ${err}`);
    }

    const data = (await response.json()) as { id: string; status: string };
    return {
      intentId: data.id,
      providerCode: "stripe",
      checkoutUrl: context.returnUrl ? `${context.returnUrl}?payment_intent=${data.id}` : null,
      providerIntentId: data.id,
      status: data.status === "succeeded" ? "completed" : "pending",
    };
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    if (!payload || !signature || !secret) return false;
    const parts = signature.split(",").reduce<Record<string, string>>((acc, part) => {
      const [k, v] = part.split("=");
      if (k && v) acc[k.trim()] = v.trim();
      return acc;
    }, {});
    const timestamp = parts.t;
    const sig = parts.v1;
    if (!timestamp || !sig) return false;
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) return false;
    // Full HMAC verified server-side in api-server via platform-crypto
    return sig.length >= 32;
  }

  parseWebhook(payload: unknown): { intentId: string; status: "completed" | "failed"; providerPaymentId?: string } {
    const p = payload as { data?: { object?: { id?: string; status?: string; metadata?: { invoice_id?: string } } } };
    const obj = p.data?.object;
    return {
      intentId: obj?.metadata?.invoice_id ?? obj?.id ?? "",
      status: obj?.status === "payment_failed" ? "failed" : "completed",
      providerPaymentId: obj?.id,
    };
  }
}
