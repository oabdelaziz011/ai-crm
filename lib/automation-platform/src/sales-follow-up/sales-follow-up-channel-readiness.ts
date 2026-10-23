/**
 * Reuse company_channels status/health fields (migration 013) to decide if
 * a follow-up may use a company channel for outbound send.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SalesFollowUpChannelReadiness = {
  connected: boolean;
  canSend: boolean;
  reason: string;
  status: string | null;
  healthStatus: string | null;
  isEnabled: boolean;
};

const BLOCKED_STATUS = new Set(["disabled", "error", "pending"]);
const BLOCKED_HEALTH = new Set(["disconnected", "error"]);

/**
 * A channel is send-ready when it exists for the company, is enabled, active,
 * not soft-deleted, and health is not disconnected/error.
 * `unknown` / `warning` / `connected` are accepted (WhatsApp often stays unknown until checked).
 */
export function evaluateCompanyChannelRow(row: {
  status?: string | null;
  health_status?: string | null;
  is_enabled?: boolean | null;
  deleted_at?: string | null;
} | null): SalesFollowUpChannelReadiness {
  if (!row || row.deleted_at) {
    return {
      connected: false,
      canSend: false,
      reason: "channel_missing",
      status: null,
      healthStatus: null,
      isEnabled: false,
    };
  }
  const status = String(row.status ?? "").toLowerCase();
  const health = String(row.health_status ?? "unknown").toLowerCase();
  const isEnabled = row.is_enabled === true;
  if (!isEnabled) {
    return {
      connected: false,
      canSend: false,
      reason: "channel_disabled",
      status,
      healthStatus: health,
      isEnabled: false,
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
    };
  }
  return {
    connected: true,
    canSend: true,
    reason: "ready",
    status,
    healthStatus: health,
    isEnabled,
  };
}

export async function loadSalesFollowUpChannelReadiness(
  client: SupabaseClient,
  input: { companyId: string; companyChannelId: string | null },
): Promise<SalesFollowUpChannelReadiness> {
  if (!input.companyChannelId) {
    return evaluateCompanyChannelRow(null);
  }
  const { data, error } = await client
    .from("company_channels")
    .select("id, status, health_status, is_enabled, deleted_at")
    .eq("company_id", input.companyId)
    .eq("id", input.companyChannelId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return evaluateCompanyChannelRow(data);
}
