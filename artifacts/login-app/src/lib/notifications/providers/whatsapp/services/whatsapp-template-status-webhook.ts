/**
 * Secure Meta message_template_status_update handling.
 *
 * Signing secret: the Meta App that owns the ValueOR WhatsApp webhook callback
 * (META_WHATSAPP_WEBHOOK_APP_SECRET, else META_EMBEDDED_SIGNUP_APP_SECRET).
 * Tenant-stored app secrets are NOT used for this path — Meta signs with the
 * app secret of the subscribed Meta application, not per-WABA credentials.
 *
 * Verification always uses requireSecret: true. Invalid/missing signatures never
 * reach database updates.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyWhatsAppWebhookSignature } from "@workspace/channel-platform";
import { applyMetaTemplateStatusUpdateForCompany } from "@/lib/notifications/providers/whatsapp/services/whatsapp-company-templates";

export type MetaTemplateStatusWebhookEvent = {
  wabaId: string;
  eventOrStatus: string;
  metaTemplateId: string | null;
  metaTemplateName: string | null;
  languageCode: string | null;
};

export class WhatsAppTemplateWebhookAuthError extends Error {
  readonly code:
    | "signing_secret_missing"
    | "signature_missing"
    | "invalid_signature";
  readonly statusCode: number;

  constructor(
    code: WhatsAppTemplateWebhookAuthError["code"],
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = "WhatsAppTemplateWebhookAuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class WhatsAppTemplateWebhookAmbiguousWabaError extends Error {
  readonly code = "ambiguous_waba_mapping" as const;
  readonly statusCode = 409;
  readonly wabaId: string;
  readonly companyIds: string[];

  constructor(wabaId: string, companyIds: string[]) {
    super(
      `WhatsApp business account ${wabaId} maps to ${companyIds.length} companies; refusing template status update.`,
    );
    this.name = "WhatsAppTemplateWebhookAmbiguousWabaError";
    this.wabaId = wabaId;
    this.companyIds = companyIds;
  }
}

export class WhatsAppTemplateWebhookProcessingError extends Error {
  readonly code = "template_status_processing_failed" as const;
  readonly statusCode = 500;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "WhatsAppTemplateWebhookProcessingError";
  }
}

/**
 * Meta App secret that owns the Cloud API webhook subscription.
 * Prefer META_WHATSAPP_WEBHOOK_APP_SECRET when set; otherwise the Embedded Signup
 * Meta App secret (same Meta app ValueOR registers webhooks against).
 * Never log the returned value.
 */
export function resolvePlatformMetaWebhookSigningSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const dedicated = String(env.META_WHATSAPP_WEBHOOK_APP_SECRET ?? "").trim();
  if (dedicated) return dedicated;
  const embedded = String(env.META_EMBEDDED_SIGNUP_APP_SECRET ?? "").trim();
  if (embedded) return embedded;
  return null;
}

export function extractMetaTemplateStatusWebhookEvents(
  payload: Record<string, unknown>,
): MetaTemplateStatusWebhookEvent[] {
  const events: MetaTemplateStatusWebhookEvent[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const wabaId = String((entry as { id?: unknown }).id ?? "").trim();
    const changes = (entry as { changes?: unknown }).changes;
    if (!wabaId || !Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const field = String((change as { field?: unknown }).field ?? "");
      if (field !== "message_template_status_update") continue;
      const value = (change as { value?: Record<string, unknown> }).value ?? {};
      const eventOrStatus = String(
        value.event ?? value.message_template_status ?? value.status ?? "",
      ).trim();
      if (!eventOrStatus) continue;
      events.push({
        wabaId,
        eventOrStatus,
        metaTemplateId:
          value.message_template_id != null ? String(value.message_template_id) : null,
        metaTemplateName:
          value.message_template_name != null
            ? String(value.message_template_name)
            : null,
        languageCode:
          value.message_template_language != null
            ? String(value.message_template_language)
            : null,
      });
    }
  }
  return events;
}

/**
 * Hard verification for template-status webhooks.
 * Always requireSecret: true — never accepts HMAC mismatch in any environment.
 */
export async function assertValidTemplateStatusWebhookSignature(input: {
  signatureHeader?: string | null;
  rawBody: string;
  env?: NodeJS.ProcessEnv;
  verifyFn?: typeof verifyWhatsAppWebhookSignature;
}): Promise<void> {
  const secret = resolvePlatformMetaWebhookSigningSecret(input.env ?? process.env);
  if (!secret) {
    throw new WhatsAppTemplateWebhookAuthError(
      "signing_secret_missing",
      "Platform Meta webhook App Secret is not configured (META_WHATSAPP_WEBHOOK_APP_SECRET or META_EMBEDDED_SIGNUP_APP_SECRET).",
      503,
    );
  }

  const header = input.signatureHeader?.trim() ?? "";
  if (!header) {
    throw new WhatsAppTemplateWebhookAuthError(
      "signature_missing",
      "Missing x-hub-signature-256 header.",
      401,
    );
  }

  const verifyFn = input.verifyFn ?? verifyWhatsAppWebhookSignature;
  const valid = await verifyFn({
    signatureHeader: header,
    rawBody: input.rawBody,
    appSecret: secret,
    requireSecret: true,
  });
  if (!valid) {
    throw new WhatsAppTemplateWebhookAuthError(
      "invalid_signature",
      "Invalid x-hub-signature-256 for WhatsApp template status webhook.",
      401,
    );
  }
}

export async function resolveCompanyIdsForWaba(
  client: SupabaseClient,
  wabaId: string,
): Promise<string[]> {
  const trimmed = wabaId.trim();
  if (!trimmed) return [];
  const { data, error } = await client
    .from("company_whatsapp_settings")
    .select("company_id")
    .eq("business_account_id", trimmed);
  if (error) {
    throw new WhatsAppTemplateWebhookProcessingError(
      `WABA ownership lookup failed: ${error.message}`,
      { cause: error },
    );
  }
  return [...new Set((data ?? []).map((r) => String((r as { company_id: string }).company_id)))];
}

/** Exactly one company for a WABA, or null if none. Throws if ambiguous. */
export async function resolveUniqueCompanyIdForWaba(
  client: SupabaseClient,
  wabaId: string,
): Promise<string | null> {
  const companyIds = await resolveCompanyIdsForWaba(client, wabaId);
  if (companyIds.length === 0) return null;
  if (companyIds.length > 1) {
    throw new WhatsAppTemplateWebhookAmbiguousWabaError(wabaId, companyIds);
  }
  return companyIds[0] ?? null;
}

export type SecureTemplateStatusWebhookResult = {
  handled: boolean;
  events: number;
  updated: number;
  companyIds: string[];
  skippedUnknownWaba: number;
};

/**
 * Verify signature first, then resolve WABA→company uniquely, then apply updates.
 * Callers must not write to the DB before this function (or before assertValid…).
 *
 * Write policy (no multi-statement transaction required):
 * - Authenticate before any tenant lookup/write.
 * - Resolve every WABA mapping before the first update.
 * - Ambiguous ownership aborts with zero writes.
 * - On the first update failure, stop remaining writes and surface a clear 500.
 * - Updates are idempotent UPDATEs (same meta_status / ids); Meta retries are safe.
 */
export async function processSecureWhatsAppTemplateStatusWebhook(
  client: SupabaseClient,
  input: {
    payload: Record<string, unknown>;
    signatureHeader?: string | null;
    rawBody: string;
    env?: NodeJS.ProcessEnv;
    verifyFn?: typeof verifyWhatsAppWebhookSignature;
  },
): Promise<SecureTemplateStatusWebhookResult> {
  const events = extractMetaTemplateStatusWebhookEvents(input.payload);
  if (events.length === 0) {
    return {
      handled: false,
      events: 0,
      updated: 0,
      companyIds: [],
      skippedUnknownWaba: 0,
    };
  }

  // CRITICAL: authenticate before any tenant resolution writes / status updates.
  await assertValidTemplateStatusWebhookSignature({
    signatureHeader: input.signatureHeader,
    rawBody: input.rawBody,
    env: input.env,
    verifyFn: input.verifyFn,
  });

  // Resolve all mappings before any write; reject ambiguous ownership.
  const resolved: Array<{ event: MetaTemplateStatusWebhookEvent; companyId: string }> = [];
  let skippedUnknownWaba = 0;
  for (const event of events) {
    const companyId = await resolveUniqueCompanyIdForWaba(client, event.wabaId);
    if (!companyId) {
      skippedUnknownWaba += 1;
      continue;
    }
    resolved.push({ event, companyId });
  }

  let updated = 0;
  const companyIds = new Set<string>();
  for (const { event, companyId } of resolved) {
    try {
      companyIds.add(companyId);
      const result = await applyMetaTemplateStatusUpdateForCompany(client, {
        companyId,
        metaTemplateId: event.metaTemplateId,
        metaTemplateName: event.metaTemplateName,
        languageCode: event.languageCode,
        eventOrStatus: event.eventOrStatus,
      });
      updated += result.updated;
    } catch (err) {
      if (
        err instanceof WhatsAppTemplateWebhookAuthError ||
        err instanceof WhatsAppTemplateWebhookAmbiguousWabaError ||
        err instanceof WhatsAppTemplateWebhookProcessingError
      ) {
        throw err;
      }
      // Abort remaining writes. Prior successful UPDATEs in this request (if any)
      // are idempotent on Meta retry — status is overwritten to the same value.
      const detail = err instanceof Error ? err.message : "unknown_error";
      throw new WhatsAppTemplateWebhookProcessingError(
        `Template status database update failed for company ${companyId}: ${detail}`,
        { cause: err },
      );
    }
  }

  return {
    handled: true,
    events: events.length,
    updated,
    companyIds: [...companyIds],
    skippedUnknownWaba,
  };
}
