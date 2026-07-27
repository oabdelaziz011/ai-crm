import type { FinancialPaymentProvider, ProviderPaymentContext } from "@/lib/billing/providers/payment-provider-registry";
import type { PaymentIntentResult } from "@/lib/billing/types/financial-types";
import { loadProviderCredentials, requireCredential } from "@/lib/billing/providers/provider-credentials";

/** Paymob Accept API integration — https://accept.paymob.com/api */
export class PaymobFinancialProvider implements FinancialPaymentProvider {
  readonly code = "paymob" as const;

  private async authenticate(): Promise<string> {
    const creds = loadProviderCredentials("paymob");
    const apiKey = requireCredential(creds.apiKey, "PAYMOB_API_KEY", "paymob");

    const response = await fetch("https://accept.paymob.com/api/auth/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });

    if (!response.ok) throw new Error(`Paymob auth failed: ${response.status}`);
    const data = (await response.json()) as { token?: string };
    if (!data.token) throw new Error("Paymob auth returned no token");
    return data.token;
  }

  async createIntent(context: ProviderPaymentContext): Promise<PaymentIntentResult> {
    const creds = loadProviderCredentials("paymob");
    const integrationId = requireCredential(creds.integrationId, "PAYMOB_INTEGRATION_ID", "paymob");
    const token = await this.authenticate();

    const orderResponse = await fetch("https://accept.paymob.com/api/ecommerce/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        delivery_needed: false,
        amount_cents: context.amountCents,
        currency: context.currency.toUpperCase(),
        merchant_order_id: context.invoiceId,
      }),
    });

    if (!orderResponse.ok) throw new Error(`Paymob order failed: ${orderResponse.status}`);
    const order = (await orderResponse.json()) as { id?: number };

    const keyResponse = await fetch("https://accept.paymob.com/api/acceptance/payment_keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        amount_cents: context.amountCents,
        expiration: 3600,
        order_id: order.id,
        integration_id: Number(integrationId),
        currency: context.currency.toUpperCase(),
        billing_data: { email: "customer@valueor.app", first_name: "Customer", last_name: "User", phone_number: "+10000000000" },
      }),
    });

    if (!keyResponse.ok) throw new Error(`Paymob payment key failed: ${keyResponse.status}`);
    const keyData = (await keyResponse.json()) as { token?: string };

    const iframeId = creds.iframeId ?? "000000";
    const checkoutUrl = keyData.token
      ? `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${keyData.token}`
      : null;

    return {
      intentId: String(order.id ?? context.invoiceId),
      providerCode: "paymob",
      checkoutUrl,
      providerIntentId: keyData.token ?? null,
      status: "pending",
    };
  }
}
