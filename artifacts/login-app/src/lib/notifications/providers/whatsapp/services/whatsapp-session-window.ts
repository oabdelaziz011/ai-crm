/**
 * Server-authoritative Meta customer-care (24h) window for WhatsApp freeform sends.
 * Never trust client-provided sessionWindowOpen flags.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isWithinMessagingResponseWindow } from "@/lib/campaigns/thread-eligibility";

export function digitsOnlyPhone(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Exact digit-form match after stripping non-digits (handles +prefix / formatting). */
export function whatsappSessionPhonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const da = digitsOnlyPhone(a);
  const db = digitsOnlyPhone(b);
  if (!da || !db) return false;
  return da === db;
}

/**
 * Load the newest WhatsApp channel_sessions.last_inbound_at for this company + recipient.
 * Returns null when no matching session exists or last_inbound_at is missing → fail closed.
 * Throws on database errors so callers can fail closed rather than inventing an open window.
 */
export async function loadWhatsAppLastInboundAtForRecipient(
  client: SupabaseClient,
  input: { companyId: string; recipientPhone: string },
): Promise<string | null> {
  const companyId = input.companyId.trim();
  const wantedDigits = digitsOnlyPhone(input.recipientPhone);
  if (!companyId || !wantedDigits) return null;

  const { data, error } = await client
    .from("channel_sessions")
    .select("external_thread_id, last_inbound_at")
    .eq("company_id", companyId)
    .eq("channel_key", "whatsapp")
    .order("last_inbound_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{
    external_thread_id: string | null;
    last_inbound_at: string | null;
  }>;

  for (const row of rows) {
    if (!whatsappSessionPhonesMatch(row.external_thread_id, wantedDigits)) continue;
    if (!row.last_inbound_at) return null;
    return String(row.last_inbound_at);
  }
  return null;
}

/** Trusted window check — missing/invalid timestamp ⇒ closed. */
export function resolveTrustedWhatsAppSessionWindowOpen(
  lastInboundAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  return isWithinMessagingResponseWindow(lastInboundAt, nowMs);
}
