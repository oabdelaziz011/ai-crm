import { createHmac, timingSafeEqual } from "node:crypto";
import { loadSaasProviderEnv } from "./provider-credentials.js";
import type {
  SaasCheckoutCreateInput,
  SaasCheckoutCreateResult,
  SaasPaymentProvider,
  SaasProviderCapability,
  SaasWebhookParseResult,
} from "./provider-types.js";

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function verifyHmacSha256Hex(secret: string, payload: string, expectedHex: string): Promise<boolean> {
  const actual = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return timingSafeEqualString(actual.toLowerCase(), expectedHex.toLowerCase());
}

export class SandboxSaasProvider implements SaasPaymentProvider {
  readonly code = "sandbox" as const;

  capability(): SaasProviderCapability {
    return "SUPPORTED";
  }

  async createHostedCheckout(input: SaasCheckoutCreateInput): Promise<SaasCheckoutCreateResult> {
    if (process.env.NODE_ENV === "production" && process.env.SAAS_ALLOW_SANDBOX_PAYMENTS !== "true") {
      return {
        capability: "CONFIGURATION_MISSING",
        providerCode: "sandbox",
        code: "SANDBOX_DISABLED_IN_PRODUCTION",
        message: "Sandbox SaaS checkout is disabled in production unless SAAS_ALLOW_SANDBOX_PAYMENTS=true",
      };
    }

    const providerSessionId = `sandbox_cs_${input.sessionId}`;
    const url = new URL(input.returnUrl);
    url.searchParams.set("saas_checkout", input.sessionId);
    url.searchParams.set("sandbox", "1");
    url.searchParams.set("provider_session", providerSessionId);

    return {
      capability: "SUPPORTED",
      providerCode: "sandbox",
      providerSessionId,
      checkoutUrl: url.toString(),
    };
  }

  async verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    const secret = loadSaasProviderEnv("sandbox").webhookSecret;
    if (!secret || !signatureHeader) return false;
    const sig = signatureHeader.replace(/^sha256=/i, "").trim();
    return verifyHmacSha256Hex(secret, rawBody, sig);
  }

  parseWebhook(payload: unknown): SaasWebhookParseResult {
    const p = (payload ?? {}) as Record<string, unknown>;
    const statusRaw = String(p.status ?? p.normalizedStatus ?? "succeeded").toLowerCase();
    const normalizedStatus =
      statusRaw === "failed" || statusRaw === "canceled" || statusRaw === "expired"
        ? (statusRaw as "failed" | "canceled" | "expired")
        : "succeeded";

    return {
      providerEventId: String(p.event_id ?? p.eventId ?? p.id ?? ""),
      eventType: String(p.event_type ?? p.eventType ?? `sandbox.payment.${normalizedStatus}`),
      normalizedStatus,
      providerSessionId: (p.provider_session_id ?? p.providerSessionId ?? null) as string | null,
      providerPaymentId: (p.provider_payment_id ?? p.providerPaymentId ?? null) as string | null,
      checkoutSessionId: (p.checkout_session_id ?? p.checkoutSessionId ?? null) as string | null,
      untrustedCompanyId: (p.company_id ?? p.companyId ?? null) as string | null,
      failureCode: (p.failure_code ?? p.failureCode ?? null) as string | null,
      failureMessage: (p.failure_message ?? p.failureMessage ?? null) as string | null,
    };
  }
}

export class StripeSaasProvider implements SaasPaymentProvider {
  readonly code = "stripe" as const;

  capability(): SaasProviderCapability {
    const env = loadSaasProviderEnv("stripe");
    if (!env.secretKey) return "CONFIGURATION_MISSING";
    return "SUPPORTED";
  }

  async createHostedCheckout(input: SaasCheckoutCreateInput): Promise<SaasCheckoutCreateResult> {
    const env = loadSaasProviderEnv("stripe");
    if (!env.secretKey) {
      return {
        capability: "CONFIGURATION_MISSING",
        providerCode: "stripe",
        code: "STRIPE_SECRET_KEY_MISSING",
        message: "STRIPE_SECRET_KEY is required for Stripe hosted checkout",
      };
    }

    const amountCents = Math.round(Number(input.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error("Invalid Stripe checkout amount");
    }

    const body = new URLSearchParams();
    body.set("mode", "payment");
    body.set("success_url", input.returnUrl);
    body.set("cancel_url", input.cancelUrl || input.returnUrl);
    body.set("client_reference_id", input.sessionId);
    body.set("metadata[billing_checkout_session_id]", input.sessionId);
    body.set("metadata[company_id]", input.companyId);
    body.set("line_items[0][quantity]", "1");
    body.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
    body.set("line_items[0][price_data][unit_amount]", String(amountCents));
    body.set("line_items[0][price_data][product_data][name]", "ValueOR subscription");

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Stripe Checkout Session create failed: ${response.status} ${err}`);
    }

    const data = (await response.json()) as { id?: string; url?: string };
    if (!data.id || !data.url) {
      return {
        capability: "CONFIGURATION_MISSING",
        providerCode: "stripe",
        code: "STRIPE_CHECKOUT_URL_MISSING",
        message: "Stripe did not return a hosted checkout URL",
      };
    }

    return {
      capability: "SUPPORTED",
      providerCode: "stripe",
      providerSessionId: data.id,
      checkoutUrl: data.url,
      raw: data as Record<string, unknown>,
    };
  }

  async verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    const secret = loadSaasProviderEnv("stripe").webhookSecret;
    if (!secret || !signatureHeader) return false;

    const parts = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
      const [k, v] = part.split("=");
      if (k && v) acc[k.trim()] = v.trim();
      return acc;
    }, {});

    const timestamp = parts.t;
    const sig = parts.v1;
    if (!timestamp || !sig) return false;

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) return false;

    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
    return timingSafeEqualString(expected, sig);
  }

  parseWebhook(payload: unknown): SaasWebhookParseResult {
    const p = payload as {
      id?: string;
      type?: string;
      data?: {
        object?: {
          id?: string;
          payment_status?: string;
          status?: string;
          client_reference_id?: string;
          metadata?: { billing_checkout_session_id?: string; company_id?: string };
          payment_intent?: string;
        };
      };
    };

    const obj = p.data?.object;
    const eventType = String(p.type ?? "stripe.event");
    let normalizedStatus: SaasWebhookParseResult["normalizedStatus"] = "failed";

    if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
      normalizedStatus =
        obj?.payment_status === "unpaid" || obj?.payment_status === "no_payment_required"
          ? "failed"
          : "succeeded";
    } else if (eventType === "checkout.session.expired") {
      normalizedStatus = "expired";
    } else if (eventType === "checkout.session.async_payment_failed") {
      normalizedStatus = "failed";
    } else if (eventType.includes("canceled")) {
      normalizedStatus = "canceled";
    }

    return {
      providerEventId: String(p.id ?? ""),
      eventType,
      normalizedStatus,
      providerSessionId: obj?.id ?? null,
      providerPaymentId: typeof obj?.payment_intent === "string" ? obj.payment_intent : obj?.id ?? null,
      checkoutSessionId:
        obj?.metadata?.billing_checkout_session_id ?? obj?.client_reference_id ?? null,
      untrustedCompanyId: obj?.metadata?.company_id ?? null,
    };
  }
}

export class PaymobSaasProvider implements SaasPaymentProvider {
  readonly code = "paymob" as const;

  capability(): SaasProviderCapability {
    const env = loadSaasProviderEnv("paymob");
    if (!env.apiKey || !env.integrationId) return "CONFIGURATION_MISSING";
    return "SUPPORTED";
  }

  async createHostedCheckout(input: SaasCheckoutCreateInput): Promise<SaasCheckoutCreateResult> {
    const env = loadSaasProviderEnv("paymob");
    if (!env.apiKey || !env.integrationId) {
      return {
        capability: "CONFIGURATION_MISSING",
        providerCode: "paymob",
        code: "PAYMOB_CREDENTIALS_MISSING",
        message: "PAYMOB_API_KEY and PAYMOB_INTEGRATION_ID are required",
      };
    }

    const authRes = await fetch("https://accept.paymob.com/api/auth/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: env.apiKey }),
    });
    if (!authRes.ok) throw new Error(`Paymob auth failed: ${authRes.status}`);
    const authData = (await authRes.json()) as { token?: string };
    if (!authData.token) throw new Error("Paymob auth returned no token");

    const amountCents = Math.round(Number(input.amount) * 100);
    const orderRes = await fetch("https://accept.paymob.com/api/ecommerce/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: authData.token,
        delivery_needed: false,
        amount_cents: amountCents,
        currency: input.currency.toUpperCase(),
        merchant_order_id: input.sessionId,
      }),
    });
    if (!orderRes.ok) throw new Error(`Paymob order failed: ${orderRes.status}`);
    const order = (await orderRes.json()) as { id?: number };

    const keyRes = await fetch("https://accept.paymob.com/api/acceptance/payment_keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: authData.token,
        amount_cents: amountCents,
        expiration: 3600,
        order_id: order.id,
        integration_id: Number(env.integrationId),
        currency: input.currency.toUpperCase(),
        billing_data: {
          email: "billing@valueor.app",
          first_name: "Company",
          last_name: "Admin",
          phone_number: "+200000000000",
        },
      }),
    });
    if (!keyRes.ok) throw new Error(`Paymob payment key failed: ${keyRes.status}`);
    const keyData = (await keyRes.json()) as { token?: string };
    const iframeId = env.iframeId || "000000";
    if (!keyData.token) {
      return {
        capability: "CONFIGURATION_MISSING",
        providerCode: "paymob",
        code: "PAYMOB_PAYMENT_TOKEN_MISSING",
        message: "Paymob did not return a payment token",
      };
    }

    return {
      capability: "SUPPORTED",
      providerCode: "paymob",
      providerSessionId: String(order.id ?? input.sessionId),
      checkoutUrl: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${keyData.token}`,
    };
  }

  async verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    const secret = loadSaasProviderEnv("paymob").hmacSecret;
    if (!secret) return false;
    // Paymob often sends hmac query/header; accept sha256 hex of raw body as MVP server verify.
    if (!signatureHeader) return false;
    const sig = signatureHeader.replace(/^sha256=/i, "").trim();
    return verifyHmacSha256Hex(secret, rawBody, sig);
  }

  parseWebhook(payload: unknown): SaasWebhookParseResult {
    const p = (payload ?? {}) as Record<string, unknown>;
    const obj = (p.obj ?? p) as Record<string, unknown>;
    const success = Boolean(obj.success === true || obj.success === "true" || p.success === true);
    const orderId = obj.order != null ? String((obj.order as { id?: number }).id ?? obj.order) : null;
    const merchantOrderId =
      typeof obj.merchant_order_id === "string"
        ? obj.merchant_order_id
        : typeof (obj.order as { merchant_order_id?: string } | undefined)?.merchant_order_id === "string"
          ? (obj.order as { merchant_order_id: string }).merchant_order_id
          : null;

    return {
      providerEventId: String(obj.id ?? p.id ?? ""),
      eventType: String(p.type ?? (success ? "paymob.payment.succeeded" : "paymob.payment.failed")),
      normalizedStatus: success ? "succeeded" : "failed",
      providerSessionId: orderId,
      providerPaymentId: obj.id != null ? String(obj.id) : null,
      checkoutSessionId: merchantOrderId,
      untrustedCompanyId: null,
    };
  }
}

export class FawrySaasProvider implements SaasPaymentProvider {
  readonly code = "fawry" as const;

  capability(): SaasProviderCapability {
    return "NOT_IMPLEMENTED";
  }

  async createHostedCheckout(_input: SaasCheckoutCreateInput): Promise<SaasCheckoutCreateResult> {
    return {
      capability: "NOT_IMPLEMENTED",
      providerCode: "fawry",
      code: "FAWRY_HOSTED_CHECKOUT_NOT_IMPLEMENTED",
      message:
        "Fawry hosted SaaS checkout is not implemented server-side. Existing login-app adapter is customer-invoice oriented and incomplete.",
    };
  }

  async verifyWebhookSignature(): Promise<boolean> {
    return false;
  }

  parseWebhook(): SaasWebhookParseResult {
    throw new Error("Fawry SaaS webhooks are NOT_IMPLEMENTED");
  }
}
