/**
 * SaaS subscription payment provider boundary (server-only).
 * Separate from login-app customer FinancialPaymentProvider / PaymentService.
 */

export type SaasProviderCode = "sandbox" | "stripe" | "paymob" | "fawry";

export type SaasProviderCapability =
  | "SUPPORTED"
  | "CONFIGURATION_MISSING"
  | "NOT_IMPLEMENTED";

export type SaasCheckoutCreateInput = {
  sessionId: string;
  companyId: string;
  amount: number;
  currency: string;
  returnUrl: string;
  cancelUrl?: string | null;
  metadata?: Record<string, string>;
};

export type SaasCheckoutCreateResult =
  | {
      capability: "SUPPORTED";
      providerCode: SaasProviderCode;
      providerSessionId: string;
      checkoutUrl: string;
      raw?: Record<string, unknown>;
    }
  | {
      capability: "CONFIGURATION_MISSING" | "NOT_IMPLEMENTED";
      providerCode: SaasProviderCode;
      code: string;
      message: string;
    };

export type SaasNormalizedPaymentStatus = "succeeded" | "failed" | "canceled" | "expired";

export type SaasWebhookParseResult = {
  providerEventId: string;
  eventType: string;
  normalizedStatus: SaasNormalizedPaymentStatus;
  providerSessionId?: string | null;
  providerPaymentId?: string | null;
  checkoutSessionId?: string | null;
  /** Never treat as authorization — informational only */
  untrustedCompanyId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
};

export interface SaasPaymentProvider {
  readonly code: SaasProviderCode;
  capability(): SaasProviderCapability;
  createHostedCheckout(input: SaasCheckoutCreateInput): Promise<SaasCheckoutCreateResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean>;
  parseWebhook(payload: unknown): SaasWebhookParseResult;
}
