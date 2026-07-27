import type { FinancialPaymentProvider, ProviderPaymentContext } from "@/lib/billing/providers/payment-provider-registry";
import type { PaymentIntentResult } from "@/lib/billing/types/financial-types";
import { loadProviderCredentials, requireCredential } from "@/lib/billing/providers/provider-credentials";
import { readClientEnv } from "@/lib/runtime-env";
import { sha256Hex } from "@workspace/platform-crypto";

/** Fawry Pay API integration — https://atfawry.fawrystaging.com/ */
export class FawryFinancialProvider implements FinancialPaymentProvider {
  readonly code = "fawry" as const;

  async createIntent(context: ProviderPaymentContext): Promise<PaymentIntentResult> {
    const creds = loadProviderCredentials("fawry");
    const merchantCode = requireCredential(creds.merchantId, "FAWRY_MERCHANT_CODE", "fawry");
    const securityKey = requireCredential(creds.secretKey, "FAWRY_SECURITY_KEY", "fawry");

    const merchantRefNum = `${context.invoiceId}_${Date.now()}`;
    const signaturePayload = `${merchantCode}${merchantRefNum}${context.customerId ?? "guest"}CARD${context.amountCents / 100}${securityKey}`;
    const signature = sha256Hex(signaturePayload);

    const baseUrl =
      readClientEnv("VITE_FAWRY_API_URL") ||
      "https://atfawry.fawrystaging.com/ECommerceWeb/Fawry/payments/charge";

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantCode,
        merchantRefNum,
        customerMobile: "01000000000",
        customerEmail: "customer@valueor.app",
        customerName: "Customer",
        amount: context.amountCents / 100,
        currencyCode: context.currency ?? "EGP",
        language: "en-gb",
        chargeItems: [
          {
            itemId: context.invoiceId,
            description: "Invoice payment",
            price: context.amountCents / 100,
            quantity: 1,
          },
        ],
        signature,
        paymentMethod: "CARD",
        returnUrl: context.returnUrl,
      }),
    });

    const payload = (await response.json()) as Record<string, unknown>;
    return {
      intentId: merchantRefNum,
      providerCode: "fawry",
      checkoutUrl: typeof payload.referenceNumber === "string" ? context.returnUrl : context.returnUrl,
      providerIntentId: String(payload.referenceNumber ?? merchantRefNum),
      status: "pending",
    };
  }
}
