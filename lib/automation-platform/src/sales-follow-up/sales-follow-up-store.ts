import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_SALES_FOLLOW_UP_SETTINGS,
  normalizeSalesFollowUpSettings,
  SALES_FOLLOW_UP_CHANNELS,
  type SalesFollowUpChannel,
  type SalesFollowUpSettings,
} from "./sales-follow-up.js";
import type { SalesFollowUpAttemptRecord, SalesFollowUpAttemptStore } from "./sales-follow-up-executor.js";

type SettingsRow = {
  company_id: string;
  enabled: boolean;
  channels: string[] | null;
  first_delay_minutes: number | null;
  subsequent_interval_minutes: number[] | null;
  max_attempts: number | null;
  timezone: string | null;
  business_hours: SalesFollowUpSettings["businessHours"] | null;
  approval_mode: string | null;
  stop_on_customer_reply: boolean | null;
  stop_on_conversion: boolean | null;
  stop_on_purchase: boolean | null;
  stop_on_opt_out: boolean | null;
  stop_on_closed_request: boolean | null;
  stop_on_reassignment: boolean | null;
  company_daily_limit: number | null;
};

export function mapSalesFollowUpSettingsRow(row: SettingsRow | null): SalesFollowUpSettings {
  if (!row) return { ...DEFAULT_SALES_FOLLOW_UP_SETTINGS };
  return normalizeSalesFollowUpSettings({
    enabled: row.enabled === true,
    channels: (row.channels ?? []).filter((channel): channel is SalesFollowUpChannel =>
      (SALES_FOLLOW_UP_CHANNELS as readonly string[]).includes(channel),
    ),
    firstDelayMinutes: row.first_delay_minutes ?? undefined,
    subsequentIntervalMinutes: row.subsequent_interval_minutes ?? undefined,
    maxAttempts: row.max_attempts ?? undefined,
    timezone: row.timezone ?? undefined,
    businessHours: row.business_hours ?? undefined,
    approvalMode: row.approval_mode === "automatic" ? "automatic" : "draft",
    stopOnCustomerReply: row.stop_on_customer_reply !== false,
    stopOnConversion: row.stop_on_conversion !== false,
    stopOnPurchase: row.stop_on_purchase !== false,
    stopOnOptOut: row.stop_on_opt_out !== false,
    stopOnClosedRequest: row.stop_on_closed_request !== false,
    stopOnReassignment: row.stop_on_reassignment !== false,
    companyDailyLimit: row.company_daily_limit ?? undefined,
  });
}

export function salesFollowUpSettingsToRow(companyId: string, settings: SalesFollowUpSettings) {
  const normalized = normalizeSalesFollowUpSettings(settings);
  return {
    company_id: companyId,
    enabled: normalized.enabled,
    channels: normalized.channels,
    first_delay_minutes: normalized.firstDelayMinutes,
    subsequent_interval_minutes: normalized.subsequentIntervalMinutes,
    max_attempts: normalized.maxAttempts,
    timezone: normalized.timezone,
    business_hours: normalized.businessHours,
    approval_mode: normalized.approvalMode,
    stop_on_customer_reply: normalized.stopOnCustomerReply,
    stop_on_conversion: normalized.stopOnConversion,
    stop_on_purchase: normalized.stopOnPurchase,
    stop_on_opt_out: normalized.stopOnOptOut,
    stop_on_closed_request: normalized.stopOnClosedRequest,
    stop_on_reassignment: normalized.stopOnReassignment,
    company_daily_limit: normalized.companyDailyLimit,
    updated_at: new Date().toISOString(),
  };
}

export async function loadSalesFollowUpSettings(
  client: SupabaseClient,
  companyId: string,
): Promise<SalesFollowUpSettings> {
  const { data, error } = await client
    .from("sales_follow_up_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapSalesFollowUpSettingsRow((data as SettingsRow | null) ?? null);
}

export async function saveSalesFollowUpSettings(
  client: SupabaseClient,
  companyId: string,
  settings: SalesFollowUpSettings,
): Promise<SalesFollowUpSettings> {
  const payload = salesFollowUpSettingsToRow(companyId, settings);
  const { data, error } = await client
    .from("sales_follow_up_settings")
    .upsert(payload, { onConflict: "company_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapSalesFollowUpSettingsRow(data as SettingsRow);
}

export function createSupabaseSalesFollowUpAttemptStore(client: SupabaseClient): SalesFollowUpAttemptStore {
  return {
    async hasIdempotencyKey(companyId, idempotencyKey) {
      const { data, error } = await client
        .from("sales_follow_up_attempts")
        .select("id")
        .eq("company_id", companyId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data?.id);
    },
    async getDeliveryState(companyId, idempotencyKey) {
      const { data, error } = await client
        .from("sales_follow_up_attempts")
        .select("id, outcome, provider_message_id")
        .eq("company_id", companyId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data?.id) {
        return { exists: false, outcome: null, providerMessageId: null };
      }
      return {
        exists: true,
        outcome: (data.outcome as string | null) ?? null,
        providerMessageId: (data.provider_message_id as string | null) ?? null,
      };
    },
    async tryClaim(attempt) {
      const { error } = await client.from("sales_follow_up_attempts").insert({
        company_id: attempt.companyId,
        lead_id: attempt.leadId,
        idempotency_key: attempt.idempotencyKey,
        channel: attempt.channel,
        outcome: attempt.outcome ?? "scheduled",
        reason: attempt.reason ?? "claim",
        provider_message_id: null,
        error_message: null,
        conversation_id: attempt.conversationId,
      });
      if (error) {
        if (error.code === "23505") {
          // Reclaim only after a recorded transient retry — never after sent/failed/etc.
          const { data: existing, error: lookupError } = await client
            .from("sales_follow_up_attempts")
            .select("id, outcome")
            .eq("company_id", attempt.companyId)
            .eq("idempotency_key", attempt.idempotencyKey)
            .maybeSingle();
          if (lookupError) throw new Error(lookupError.message);
          if (String(existing?.outcome ?? "").toLowerCase() !== "retried" || !existing?.id) {
            return false;
          }
          const { error: updateError } = await client
            .from("sales_follow_up_attempts")
            .update({
              channel: attempt.channel,
              outcome: attempt.outcome ?? "scheduled",
              reason: attempt.reason ?? "retry_reclaim",
              provider_message_id: null,
              error_message: null,
              conversation_id: attempt.conversationId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .eq("company_id", attempt.companyId)
            .eq("outcome", "retried");
          if (updateError) throw new Error(updateError.message);
          return true;
        }
        throw new Error(error.message);
      }
      return true;
    },
    async record(attempt: SalesFollowUpAttemptRecord) {
      const { data: existing, error: lookupError } = await client
        .from("sales_follow_up_attempts")
        .select("id")
        .eq("company_id", attempt.companyId)
        .eq("idempotency_key", attempt.idempotencyKey)
        .maybeSingle();
      if (lookupError) throw new Error(lookupError.message);

      if (existing?.id) {
        const { error } = await client
          .from("sales_follow_up_attempts")
          .update({
            channel: attempt.channel,
            outcome: attempt.outcome,
            reason: attempt.reason,
            provider_message_id: attempt.providerMessageId,
            error_message: attempt.errorMessage,
            conversation_id: attempt.conversationId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("company_id", attempt.companyId);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await client.from("sales_follow_up_attempts").insert({
        company_id: attempt.companyId,
        lead_id: attempt.leadId,
        idempotency_key: attempt.idempotencyKey,
        channel: attempt.channel,
        outcome: attempt.outcome,
        reason: attempt.reason,
        provider_message_id: attempt.providerMessageId,
        error_message: attempt.errorMessage,
        conversation_id: attempt.conversationId,
      });
      if (error) {
        if (error.code === "23505") return;
        throw new Error(error.message);
      }
    },
  };
}
