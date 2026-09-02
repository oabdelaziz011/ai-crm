/**
 * Persist campaign recipient delivery / reply reconciliation.
 * Always company-scoped. Never phone / last-9. Never creates conversations.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyCampaignLifecyclePatch,
  computeCampaignDeliveryStatusPatch,
  computeCampaignReplyPatch,
  computeCampaignSendSuccessPatch,
  normalizeProviderMessageId,
  type CampaignDeliveryWebhookStatus,
  type CampaignRecipientLifecyclePatch,
  type CampaignRecipientLifecycleSnapshot,
} from "./campaign-delivery-reconciliation";

const SELECT_COLS =
  "id, company_id, status, provider_message_id, notification_queue_id, sent_at, delivered_at, read_at, failed_at, replied_at, error_message";

function asSnapshot(row: Record<string, unknown>): CampaignRecipientLifecycleSnapshot {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    status: row.status as CampaignRecipientLifecycleSnapshot["status"],
    provider_message_id:
      typeof row.provider_message_id === "string" ? row.provider_message_id : null,
    notification_queue_id:
      typeof row.notification_queue_id === "string" ? row.notification_queue_id : null,
    sent_at: typeof row.sent_at === "string" ? row.sent_at : null,
    delivered_at: typeof row.delivered_at === "string" ? row.delivered_at : null,
    read_at: typeof row.read_at === "string" ? row.read_at : null,
    failed_at: typeof row.failed_at === "string" ? row.failed_at : null,
    replied_at: typeof row.replied_at === "string" ? row.replied_at : null,
    error_message: typeof row.error_message === "string" ? row.error_message : null,
  };
}

async function writePatch(
  client: SupabaseClient,
  companyId: string,
  recipientId: string,
  patch: CampaignRecipientLifecyclePatch,
): Promise<boolean> {
  const { error } = await client
    .from("marketing_campaign_recipients")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", recipientId)
    .eq("company_id", companyId);
  if (error) {
    console.warn(
      "[campaign-delivery-reconcile] update failed",
      error.message,
    );
    return false;
  }
  return true;
}

export type CampaignSendReconcileResult = {
  updated: boolean;
  reason?: string;
  recipientId?: string;
};

/** Send-success: company_id + notification_queue_id → set wamid / sent / sent_at. */
export async function reconcileCampaignRecipientSendSuccess(
  client: SupabaseClient,
  input: {
    companyId: string;
    queueId: string;
    providerMessageId: string;
    occurredAt?: string;
  },
): Promise<CampaignSendReconcileResult> {
  const companyId = input.companyId?.trim();
  const queueId = input.queueId?.trim();
  const wamid = normalizeProviderMessageId(input.providerMessageId);
  if (!companyId || !queueId) {
    return { updated: false, reason: "missing_company_or_queue" };
  }
  if (!wamid) {
    return { updated: false, reason: "missing_wamid" };
  }

  const { data, error } = await client
    .from("marketing_campaign_recipients")
    .select(SELECT_COLS)
    .eq("company_id", companyId)
    .eq("notification_queue_id", queueId)
    .maybeSingle();

  if (error) {
    console.warn("[campaign-delivery-reconcile] send lookup failed", error.message);
    return { updated: false, reason: "lookup_error" };
  }
  if (!data) {
    return { updated: false, reason: "recipient_not_found" };
  }

  const current = asSnapshot(data as Record<string, unknown>);
  const patch = computeCampaignSendSuccessPatch(current, {
    providerMessageId: wamid,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });
  if (!patch) {
    return { updated: false, reason: "noop", recipientId: current.id };
  }

  const ok = await writePatch(client, companyId, current.id, patch);
  return {
    updated: ok,
    reason: ok ? "updated" : "write_failed",
    recipientId: current.id,
  };
}

export type CampaignDeliveryStatusReconcileResult = {
  updated: boolean;
  reason?: string;
  recipientId?: string;
};

/** Webhook status: company_id + provider_message_id (wamid). */
export async function reconcileCampaignRecipientDeliveryStatus(
  client: SupabaseClient,
  input: {
    companyId: string;
    providerMessageId: string;
    status: CampaignDeliveryWebhookStatus;
    occurredAt?: string | null;
  },
): Promise<CampaignDeliveryStatusReconcileResult> {
  const companyId = input.companyId?.trim();
  const wamid = normalizeProviderMessageId(input.providerMessageId);
  if (!companyId) {
    return { updated: false, reason: "missing_company" };
  }
  if (!wamid) {
    return { updated: false, reason: "missing_or_invalid_wamid" };
  }

  const { data, error } = await client
    .from("marketing_campaign_recipients")
    .select(SELECT_COLS)
    .eq("company_id", companyId)
    .eq("provider_message_id", wamid)
    .limit(2);

  if (error) {
    console.warn(
      "[campaign-delivery-reconcile] delivery lookup failed",
      error.message,
    );
    return { updated: false, reason: "lookup_error" };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    return { updated: false, reason: "recipient_not_found" };
  }
  if (rows.length > 1) {
    // Ambiguous within tenant — do not invent.
    return { updated: false, reason: "ambiguous_provider_message_id" };
  }

  const current = asSnapshot(rows[0]!);
  const patch = computeCampaignDeliveryStatusPatch(current, {
    status: input.status,
    occurredAt: input.occurredAt?.trim() || new Date().toISOString(),
  });
  if (!patch) {
    return { updated: false, reason: "noop", recipientId: current.id };
  }

  const ok = await writePatch(client, companyId, current.id, patch);
  return {
    updated: ok,
    reason: ok ? "updated" : "write_failed",
    recipientId: current.id,
  };
}

export type CampaignReplyReconcileResult = {
  updated: boolean;
  reason?: string;
  recipientId?: string;
};

/**
 * Reply attribution: company_id + provider_message_id = context.id.
 * Free-text without context.id → no-op.
 */
export async function reconcileCampaignRecipientQuotedReply(
  client: SupabaseClient,
  input: {
    companyId: string;
    contextMessageId: string | null | undefined;
    occurredAt?: string | null;
  },
): Promise<CampaignReplyReconcileResult> {
  const companyId = input.companyId?.trim();
  const contextId = normalizeProviderMessageId(input.contextMessageId);
  if (!companyId) {
    return { updated: false, reason: "missing_company" };
  }
  if (!contextId) {
    return { updated: false, reason: "missing_context_id" };
  }

  const { data, error } = await client
    .from("marketing_campaign_recipients")
    .select(SELECT_COLS)
    .eq("company_id", companyId)
    .eq("provider_message_id", contextId)
    .limit(2);

  if (error) {
    console.warn(
      "[campaign-delivery-reconcile] reply lookup failed",
      error.message,
    );
    return { updated: false, reason: "lookup_error" };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    return { updated: false, reason: "recipient_not_found" };
  }
  if (rows.length > 1) {
    return { updated: false, reason: "ambiguous_provider_message_id" };
  }

  const current = asSnapshot(rows[0]!);
  const patch = computeCampaignReplyPatch(current, {
    occurredAt: input.occurredAt?.trim() || new Date().toISOString(),
  });
  if (!patch) {
    return { updated: false, reason: "noop", recipientId: current.id };
  }

  const ok = await writePatch(client, companyId, current.id, patch);
  return {
    updated: ok,
    reason: ok ? "updated" : "write_failed",
    recipientId: current.id,
  };
}

/** Adapter for channel-platform optional port. */
export function createCampaignDeliveryReconcilePort(client: SupabaseClient) {
  return {
    async reconcileDeliveryStatus(input: {
      companyId: string;
      providerMessageId: string;
      status: CampaignDeliveryWebhookStatus;
      occurredAt?: string | null;
    }) {
      return reconcileCampaignRecipientDeliveryStatus(client, input);
    },
    async reconcileQuotedReply(input: {
      companyId: string;
      contextMessageId: string | null | undefined;
      occurredAt?: string | null;
    }) {
      return reconcileCampaignRecipientQuotedReply(client, input);
    },
  };
}

export {
  applyCampaignLifecyclePatch,
  computeCampaignDeliveryStatusPatch,
  computeCampaignReplyPatch,
  computeCampaignSendSuccessPatch,
  normalizeProviderMessageId,
};
