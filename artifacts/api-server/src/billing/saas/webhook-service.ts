import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadPlatformEnv } from "../../config/env.js";
import { HttpError } from "../../middleware/error-handler.js";
import { getSaasPaymentProviderRegistry } from "./provider-registry.js";
import type { SaasProviderCode } from "./provider-types.js";

function serviceClient(): SupabaseClient {
  const env = loadPlatformEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new HttpError(503, "Supabase service credentials unavailable.", "supabase_unavailable");
  }
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const SUPPORTED_WEBHOOK_PROVIDERS = new Set(["sandbox", "stripe", "paymob"]);

export async function processSaasPaymentWebhook(input: {
  provider: string;
  rawBody: string;
  signatureHeader: string | null;
}): Promise<Record<string, unknown>> {
  const providerCode = input.provider.trim().toLowerCase();
  if (!SUPPORTED_WEBHOOK_PROVIDERS.has(providerCode) && providerCode !== "fawry") {
    throw new HttpError(400, `Unknown payment provider: ${providerCode}`, "UNKNOWN_PROVIDER");
  }

  const registry = getSaasPaymentProviderRegistry();
  const provider = registry.get(providerCode);
  if (!provider) {
    throw new HttpError(400, `Unknown payment provider: ${providerCode}`, "UNKNOWN_PROVIDER");
  }

  if (provider.capability() === "NOT_IMPLEMENTED") {
    throw new HttpError(501, `${providerCode} webhooks are not implemented`, "NOT_IMPLEMENTED");
  }

  const valid = await provider.verifyWebhookSignature(input.rawBody, input.signatureHeader);
  if (!valid) {
    throw new HttpError(401, "Invalid payment webhook signature", "INVALID_SIGNATURE");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody || "{}");
  } catch {
    throw new HttpError(400, "Malformed payment webhook JSON", "MALFORMED_PAYLOAD");
  }

  let parsed;
  try {
    parsed = provider.parseWebhook(payload);
  } catch (err) {
    throw new HttpError(
      400,
      err instanceof Error ? err.message : "Malformed payment webhook",
      "MALFORMED_PAYLOAD",
    );
  }

  if (!parsed.providerEventId) {
    throw new HttpError(400, "Missing provider event id", "MALFORMED_PAYLOAD");
  }

  // Never authorize by untrusted company_id from payload — resolve via session only.
  void parsed.untrustedCompanyId;

  const client = serviceClient();
  const { data, error } = await client.rpc("record_billing_checkout_payment_event_v1", {
    p_provider_code: providerCode as SaasProviderCode,
    p_provider_event_id: parsed.providerEventId,
    p_event_type: parsed.eventType,
    p_normalized_status: parsed.normalizedStatus,
    p_provider_session_id: parsed.providerSessionId ?? null,
    p_provider_payment_id: parsed.providerPaymentId ?? null,
    p_checkout_session_id: parsed.checkoutSessionId ?? null,
    p_payload: {
      event_type: parsed.eventType,
      provider_session_id: parsed.providerSessionId,
      provider_payment_id: parsed.providerPaymentId,
      checkout_session_id: parsed.checkoutSessionId,
    },
    p_idempotency_key: `${providerCode}:${parsed.providerEventId}`,
    p_failure_code: parsed.failureCode ?? null,
    p_failure_message: parsed.failureMessage ?? null,
  });

  if (error) {
    throw new HttpError(400, error.message, "WEBHOOK_PROCESS_FAILED");
  }

  const verified = data as Record<string, unknown>;
  const code = String(verified?.code ?? "");

  // Part 3: settle only after PAYMENT_VERIFIED — never on failure/cancel/expire
  if (code === "PAYMENT_VERIFIED" && verified.checkout_session_id) {
    const { data: settled, error: settleError } = await client.rpc("settle_saas_verified_payment_v1", {
      p_checkout_session_id: verified.checkout_session_id,
    });

    if (settleError) {
      throw new HttpError(400, settleError.message, "SETTLEMENT_FAILED");
    }

    return {
      ...verified,
      settlement: settled,
    };
  }

  return verified;
}
