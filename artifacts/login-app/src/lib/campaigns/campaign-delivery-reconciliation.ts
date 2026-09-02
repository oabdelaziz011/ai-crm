/**
 * Campaign WhatsApp delivery & reply reconciliation — pure patch computation.
 * No DB / Meta / queue / phone matching.
 *
 * Durable recipient status CHECK remains: pending | queued | sent | failed | skipped
 * Display lifecycle (sent → delivered → read) uses timestamps only.
 */

export type CampaignRecipientLifecycleStatus =
  | "pending"
  | "queued"
  | "sent"
  | "failed"
  | "skipped";

export type CampaignRecipientLifecycleSnapshot = {
  id: string;
  company_id: string;
  status: CampaignRecipientLifecycleStatus;
  provider_message_id: string | null;
  notification_queue_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  replied_at: string | null;
  error_message?: string | null;
};

export type CampaignRecipientLifecyclePatch = Partial<{
  status: CampaignRecipientLifecycleStatus;
  provider_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  replied_at: string | null;
  error_message: string | null;
}>;

export type CampaignDeliveryWebhookStatus = "sent" | "delivered" | "read" | "failed";

/** Higher wins. failed is handled separately and never erases delivered/read. */
const LIFECYCLE_RANK = {
  sent: 1,
  delivered: 2,
  read: 3,
} as const;

export function normalizeProviderMessageId(
  value: string | null | undefined,
): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

export function currentLifecycleRank(
  row: Pick<
    CampaignRecipientLifecycleSnapshot,
    "sent_at" | "delivered_at" | "read_at" | "status"
  >,
): number {
  if (row.read_at) return LIFECYCLE_RANK.read;
  if (row.delivered_at) return LIFECYCLE_RANK.delivered;
  if (row.sent_at || row.status === "sent") return LIFECYCLE_RANK.sent;
  return 0;
}

function patchIsEmpty(patch: CampaignRecipientLifecyclePatch): boolean {
  return Object.keys(patch).length === 0;
}

/**
 * A) queued → sent (Meta accept / wamid received).
 * Lookup identity is company_id + notification_queue_id (caller).
 */
export function computeCampaignSendSuccessPatch(
  current: CampaignRecipientLifecycleSnapshot,
  input: { providerMessageId: string; occurredAt: string },
): CampaignRecipientLifecyclePatch | null {
  const wamid = normalizeProviderMessageId(input.providerMessageId);
  if (!wamid) return null;
  if (current.status === "skipped") return null;

  const patch: CampaignRecipientLifecyclePatch = {};

  if (!normalizeProviderMessageId(current.provider_message_id)) {
    patch.provider_message_id = wamid;
  } else if (normalizeProviderMessageId(current.provider_message_id) !== wamid) {
    // Do not overwrite an existing different wamid on this row.
    return null;
  }

  if (!current.sent_at) {
    patch.sent_at = input.occurredAt;
  }

  if (current.status === "pending" || current.status === "queued") {
    patch.status = "sent";
  }

  return patchIsEmpty(patch) ? null : patch;
}

/**
 * Webhook delivery/read/failed against an already-linked recipient
 * (company_id + provider_message_id lookup by caller).
 */
export function computeCampaignDeliveryStatusPatch(
  current: CampaignRecipientLifecycleSnapshot,
  input: {
    status: CampaignDeliveryWebhookStatus;
    occurredAt: string;
  },
): CampaignRecipientLifecyclePatch | null {
  if (!normalizeProviderMessageId(current.provider_message_id)) {
    return null;
  }
  if (current.status === "skipped") return null;

  const at = input.occurredAt;
  const patch: CampaignRecipientLifecyclePatch = {};
  const rank = currentLifecycleRank(current);

  if (input.status === "failed") {
    if (!current.failed_at) patch.failed_at = at;
    if (current.status !== "failed" && current.status !== "skipped") {
      patch.status = "failed";
    }
    // Never erase sent/delivered/read timestamps.
    return patchIsEmpty(patch) ? null : patch;
  }

  if (input.status === "sent") {
    if (rank >= LIFECYCLE_RANK.sent) {
      // Idempotent / no regression from delivered|read.
      return null;
    }
    if (!current.sent_at) patch.sent_at = at;
    if (current.status === "pending" || current.status === "queued") {
      patch.status = "sent";
    }
    return patchIsEmpty(patch) ? null : patch;
  }

  if (input.status === "delivered") {
    if (rank > LIFECYCLE_RANK.delivered) {
      // Already read — fill delivered_at if missing, never regress.
      if (!current.delivered_at) patch.delivered_at = at;
      if (!current.sent_at) patch.sent_at = at;
      if (current.status === "pending" || current.status === "queued") {
        patch.status = "sent";
      }
      return patchIsEmpty(patch) ? null : patch;
    }
    if (current.delivered_at) {
      // Duplicate delivered — idempotent.
      return null;
    }
    patch.delivered_at = at;
    if (!current.sent_at) patch.sent_at = at;
    if (current.status === "pending" || current.status === "queued") {
      patch.status = "sent";
    }
    return patch;
  }

  // read
  if (current.read_at) {
    // Duplicate read — idempotent. Still backfill delivered/sent if missing.
    if (!current.delivered_at) patch.delivered_at = at;
    if (!current.sent_at) patch.sent_at = at;
    if (current.status === "pending" || current.status === "queued") {
      patch.status = "sent";
    }
    return patchIsEmpty(patch) ? null : patch;
  }

  patch.read_at = at;
  if (!current.delivered_at) patch.delivered_at = at;
  if (!current.sent_at) patch.sent_at = at;
  if (current.status === "pending" || current.status === "queued") {
    patch.status = "sent";
  }
  return patch;
}

/**
 * Quoted-reply attribution via Meta message.context.id === provider_message_id.
 * Caller must enforce company scope + exactly-one match.
 */
export function computeCampaignReplyPatch(
  current: CampaignRecipientLifecycleSnapshot,
  input: { occurredAt: string },
): CampaignRecipientLifecyclePatch | null {
  if (!normalizeProviderMessageId(current.provider_message_id)) return null;
  if (current.replied_at) return null; // idempotent
  return { replied_at: input.occurredAt };
}

export function applyCampaignLifecyclePatch(
  current: CampaignRecipientLifecycleSnapshot,
  patch: CampaignRecipientLifecyclePatch,
): CampaignRecipientLifecycleSnapshot {
  return { ...current, ...patch };
}
