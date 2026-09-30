import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadPlatformEnv } from "../../config/env.js";
import { HttpError } from "../../middleware/error-handler.js";
import { loadSaasProviderEnv } from "./provider-credentials.js";
import { processSaasPaymentWebhook } from "./webhook-service.js";

function serviceClient(): SupabaseClient {
  const env = loadPlatformEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new HttpError(503, "Supabase service credentials unavailable.", "supabase_unavailable");
  }
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Local/sandbox only: complete a hosted sandbox checkout after the browser return.
 * Real providers settle via signed webhooks — never call this for stripe/paymob/fawry.
 */
export async function confirmSandboxSaasCheckout(input: {
  companyId: string;
  sessionId: string;
}): Promise<Record<string, unknown>> {
  if (process.env.NODE_ENV === "production" && process.env.SAAS_ALLOW_SANDBOX_PAYMENTS !== "true") {
    throw new HttpError(403, "Sandbox confirm is disabled in production.", "SANDBOX_DISABLED");
  }

  const client = serviceClient();
  const { data: session, error } = await client
    .from("billing_checkout_sessions")
    .select(
      "id, company_id, status, provider_code, provider_session_id, settled_at, billing_payment_id, amount, currency",
    )
    .eq("id", input.sessionId)
    .maybeSingle();

  if (error) {
    throw new HttpError(400, error.message, "session_lookup_failed");
  }
  if (!session) {
    throw new HttpError(404, "Checkout session not found.", "session_not_found");
  }
  if (String(session.company_id) !== input.companyId) {
    throw new HttpError(403, "Checkout session does not belong to this company.", "forbidden");
  }
  if (String(session.provider_code).toLowerCase() !== "sandbox") {
    throw new HttpError(400, "Only sandbox checkout sessions can be confirmed this way.", "not_sandbox");
  }

  if (session.settled_at && session.billing_payment_id) {
    return {
      ok: true,
      alreadySettled: true,
      sessionId: session.id,
      billingPaymentId: session.billing_payment_id,
      status: session.status,
    };
  }

  const providerSessionId =
    (session.provider_session_id as string | null) ?? `sandbox_cs_${session.id}`;
  const eventId = `sandbox_evt_${session.id}`;
  const payload = {
    id: eventId,
    event_id: eventId,
    status: "succeeded",
    event_type: "sandbox.payment.succeeded",
    provider_session_id: providerSessionId,
    provider_payment_id: `sandbox_pay_${session.id}`,
    checkout_session_id: session.id,
    company_id: session.company_id,
  };
  const rawBody = JSON.stringify(payload);
  const secret = loadSaasProviderEnv("sandbox").webhookSecret ?? "dev-saas-sandbox-webhook";
  const signature = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const result = await processSaasPaymentWebhook({
    provider: "sandbox",
    rawBody,
    signatureHeader: `sha256=${signature}`,
  });

  return {
    ok: true,
    alreadySettled: false,
    sessionId: session.id,
    amount: session.amount,
    currency: session.currency,
    webhook: result,
  };
}
