/**
 * Reuse company_channels status/health fields (migration 013) to decide if
 * a follow-up may use a company channel for outbound send.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesFollowUpChannel } from "./sales-follow-up.js";
import { SALES_FOLLOW_UP_OMNI_CHANNEL_KEY } from "./sales-follow-up-channel-map.js";

export type SalesFollowUpChannelReadiness = {
  connected: boolean;
  canSend: boolean;
  reason: string;
  status: string | null;
  healthStatus: string | null;
  isEnabled: boolean;
  channelKey: string | null;
};

const BLOCKED_STATUS = new Set(["disabled", "error", "pending"]);
const BLOCKED_HEALTH = new Set(["disconnected", "error"]);

/**
 * A channel is send-ready when it exists for the company, is enabled, active,
 * not soft-deleted, and health is not disconnected/error.
 * `unknown` / `warning` / `connected` are accepted (WhatsApp often stays unknown until checked).
 * When `expectedChannelKey` is set, the catalog key must match (WhatsApp jobs never use email).
 */
export function evaluateCompanyChannelRow(
  row: {
    status?: string | null;
    health_status?: string | null;
    is_enabled?: boolean | null;
    deleted_at?: string | null;
    channel_key?: string | null;
  } | null,
  expectedChannelKey?: string | null,
): SalesFollowUpChannelReadiness {
  if (!row || row.deleted_at) {
    return {
      connected: false,
      canSend: false,
      reason: "channel_missing",
      status: null,
      healthStatus: null,
      isEnabled: false,
      channelKey: null,
    };
  }
  const status = String(row.status ?? "").toLowerCase();
  const health = String(row.health_status ?? "unknown").toLowerCase();
  const isEnabled = row.is_enabled === true;
  const channelKey = row.channel_key ? String(row.channel_key).toLowerCase() : null;

  if (!isEnabled) {
    return {
      connected: false,
      canSend: false,
      reason: "channel_disabled",
      status,
      healthStatus: health,
      isEnabled: false,
      channelKey,
    };
  }
  if (BLOCKED_STATUS.has(status) || status !== "active") {
    return {
      connected: status === "active",
      canSend: false,
      reason: "channel_not_active",
      status,
      healthStatus: health,
      isEnabled,
      channelKey,
    };
  }
  if (BLOCKED_HEALTH.has(health)) {
    return {
      connected: false,
      canSend: false,
      reason: "channel_unhealthy",
      status,
      healthStatus: health,
      isEnabled,
      channelKey,
    };
  }

  const expected = expectedChannelKey ? String(expectedChannelKey).toLowerCase() : null;
  if (expected) {
    if (!channelKey) {
      return {
        connected: true,
        canSend: false,
        reason: "channel_type_mismatch",
        status,
        healthStatus: health,
        isEnabled,
        channelKey: null,
      };
    }
    if (channelKey !== expected) {
      return {
        connected: true,
        canSend: false,
        reason: "channel_type_mismatch",
        status,
        healthStatus: health,
        isEnabled,
        channelKey,
      };
    }
  }

  return {
    connected: true,
    canSend: true,
    reason: "ready",
    status,
    healthStatus: health,
    isEnabled,
    channelKey,
  };
}

function extractEmbeddedChannelKey(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const embedded =
    (data.communication_channel as { key?: string } | null | undefined) ??
    (data.communication_channels as { key?: string } | Array<{ key?: string }> | null | undefined);
  if (Array.isArray(embedded)) {
    const key = embedded[0]?.key;
    return key ? String(key).toLowerCase() : null;
  }
  if (embedded && typeof embedded === "object" && embedded.key) {
    return String(embedded.key).toLowerCase();
  }
  return null;
}

export async function loadSalesFollowUpChannelReadiness(
  client: SupabaseClient,
  input: {
    companyId: string;
    companyChannelId: string | null;
    /** Follow-up job channel; when set, company channel catalog key must match. */
    expectedChannel?: SalesFollowUpChannel | null;
  },
): Promise<SalesFollowUpChannelReadiness> {
  const expectedChannelKey = input.expectedChannel
    ? SALES_FOLLOW_UP_OMNI_CHANNEL_KEY[input.expectedChannel]
    : null;

  if (!input.companyChannelId) {
    return evaluateCompanyChannelRow(null, expectedChannelKey);
  }
  const { data, error } = await client
    .from("company_channels")
    .select(
      "id, status, health_status, is_enabled, deleted_at, communication_channel:communication_channels(key)",
    )
    .eq("company_id", input.companyId)
    .eq("id", input.companyChannelId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = data
    ? {
        ...data,
        channel_key: extractEmbeddedChannelKey(data as Record<string, unknown>),
      }
    : null;
  return evaluateCompanyChannelRow(row, expectedChannelKey);
}
