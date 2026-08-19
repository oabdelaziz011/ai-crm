import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadPlatformEnv } from "../../config/env.js";
import { HttpError } from "../../middleware/error-handler.js";
import { getSaasPaymentProviderRegistry } from "./provider-registry.js";
import type { SaasProviderCode } from "./provider-types.js";

export type CreateSaasCheckoutRequest = {
  companyId: string;
  returnUrl: string;
  cancelUrl?: string | null;
  idempotencyKey?: string | null;
  actorUserId?: string | null;
  /** Ignored for amount/currency/company — server locks payable from DB. */
};

function serviceClient(): SupabaseClient {
  const env = loadPlatformEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new HttpError(503, "Supabase service credentials unavailable.", "supabase_unavailable");
  }
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function resolveProviderOverride(sessionProvider: string): string {
  // Session already stores resolve_active_payment_provider_code result.
  // Optional platform override when DB returns sandbox but Stripe is configured for staged tests.
  const override = process.env.SAAS_CHECKOUT_PROVIDER?.trim().toLowerCase();
  if (override && ["sandbox", "stripe", "paymob", "fawry"].includes(override)) {
    return override;
  }
  return sessionProvider;
}

export async function createSaasCheckoutSession(input: CreateSaasCheckoutRequest) {
  const client = serviceClient();
  const registry = getSaasPaymentProviderRegistry();

  const { data, error } = await client.rpc("create_billing_checkout_session_v1", {
    p_return_url: input.returnUrl,
    p_cancel_url: input.cancelUrl ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_company_id: input.companyId,
    p_provider_code: process.env.SAAS_CHECKOUT_PROVIDER?.trim() || null,
    p_actor_user_id: input.actorUserId ?? null,
  });

  if (error) {
    throw new HttpError(400, error.message, "checkout_create_failed");
  }

  const result = data as {
    ok: boolean;
    code?: string;
    message?: string;
    idempotent_replay?: boolean;
    session?: Record<string, unknown>;
  };

  if (!result?.ok) {
    const code = result?.code ?? "checkout_rejected";
    const forbidden = new Set([
      "UNAUTHORIZED_CHECKOUT",
      "COMPANY_SUSPENDED",
      "COMPANY_REJECTED",
    ]);
    throw new HttpError(
      forbidden.has(code) ? 403 : 400,
      result?.message ?? "Checkout not available",
      code,
    );
  }

  const session = result.session!;
  if (result.idempotent_replay && session.checkout_url && session.status === "pending") {
    return {
      ok: true,
      idempotentReplay: true,
      sessionId: session.id,
      provider: session.provider_code,
      amount: session.amount,
      currency: session.currency,
      status: session.status,
      checkoutUrl: session.checkout_url,
      expiresAt: session.expires_at,
    };
  }

  const providerCode = resolveProviderOverride(String(session.provider_code)) as SaasProviderCode;
  const provider = registry.get(providerCode);
  if (!provider) {
    throw new HttpError(400, `Unknown provider: ${providerCode}`, "UNKNOWN_PROVIDER");
  }

  const created = await provider.createHostedCheckout({
    sessionId: String(session.id),
    companyId: input.companyId,
    amount: Number(session.amount),
    currency: String(session.currency),
    returnUrl: input.returnUrl,
    cancelUrl: input.cancelUrl,
    metadata: {
      billing_checkout_session_id: String(session.id),
    },
  });

  if (created.capability !== "SUPPORTED") {
    throw new HttpError(
      created.capability === "NOT_IMPLEMENTED" ? 501 : 503,
      created.message,
      created.code,
    );
  }

  // Ensure provider on session matches what we attached (override case)
  if (providerCode !== session.provider_code) {
    await client
      .from("billing_checkout_sessions")
      .update({ provider_code: providerCode })
      .eq("id", session.id);
  }

  const { data: attached, error: attachError } = await client.rpc("attach_billing_checkout_provider_v1", {
    p_session_id: session.id,
    p_provider_session_id: created.providerSessionId,
    p_checkout_url: created.checkoutUrl,
    p_provider_code: providerCode,
    p_metadata: { provider_capability: "SUPPORTED" },
  });

  if (attachError) {
    throw new HttpError(500, attachError.message, "checkout_attach_failed");
  }

  const attachedSession = (attached as { session: Record<string, unknown> }).session;

  return {
    ok: true,
    idempotentReplay: false,
    sessionId: attachedSession.id,
    provider: attachedSession.provider_code,
    amount: attachedSession.amount,
    currency: attachedSession.currency,
    status: attachedSession.status,
    checkoutUrl: attachedSession.checkout_url,
    expiresAt: attachedSession.expires_at,
    providerSessionId: attachedSession.provider_session_id,
  };
}
