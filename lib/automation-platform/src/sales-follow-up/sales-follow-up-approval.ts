/**
 * Human approval workflow for sales follow-up drafts.
 *
 * Worker draft mode completes jobs with last_outcome=draft and stores message_text.
 * This module recovers those drafts for review, reject, edit, and approve→send —
 * without inventing a second sender or changing automatic product AI replies.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateSalesFollowUp,
  type SalesFollowUpChannel,
  type SalesFollowUpSettings,
} from "./sales-follow-up.js";
import type {
  SalesFollowUpDeliveryPort,
  SalesFollowUpAttemptStore,
} from "./sales-follow-up-executor.js";
import type {
  SalesFollowUpEligibilitySnapshot,
  SalesFollowUpJobRecord,
} from "./sales-follow-up-jobs.js";
import { loadSalesFollowUpSettings } from "./sales-follow-up-store.js";

export type SalesFollowUpReviewStatus =
  | "pending_review"
  | "sent"
  | "failed"
  | "cancelled";

export type SalesFollowUpReviewItem = {
  jobId: string;
  companyId: string;
  leadId: string;
  conversationId: string | null;
  channel: SalesFollowUpChannel | null;
  attemptNumber: number;
  dueAt: string;
  createdAt: string | null;
  messageText: string;
  status: SalesFollowUpReviewStatus;
  lastOutcome: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
  leadTitle: string | null;
  contactName: string | null;
  productInterestName: string | null;
  productInterestId: string | null;
  lifecycleStatus: string | null;
  isQualified: boolean | null;
};

type JobRow = {
  id: string;
  company_id: string;
  lead_id: string;
  conversation_id: string | null;
  company_channel_id: string | null;
  external_thread_id: string | null;
  channel: string | null;
  attempt_number: number;
  due_at: string;
  created_at?: string | null;
  message_text: string;
  idempotency_key: string;
  status: string;
  claim_owner: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  last_outcome: string | null;
  provider_message_id: string | null;
  error_message: string | null;
};

function mapJob(row: JobRow): SalesFollowUpJobRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    leadId: row.lead_id,
    conversationId: row.conversation_id,
    companyChannelId: row.company_channel_id,
    externalThreadId: row.external_thread_id,
    channel: (row.channel as SalesFollowUpChannel | null) ?? null,
    attemptNumber: row.attempt_number,
    dueAt: new Date(row.due_at),
    createdAt: row.created_at ? new Date(row.created_at) : null,
    messageText: row.message_text ?? "",
    idempotencyKey: row.idempotency_key,
    status: row.status as SalesFollowUpJobRecord["status"],
    claimOwner: row.claim_owner,
    claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
    claimExpiresAt: row.claim_expires_at ? new Date(row.claim_expires_at) : null,
    lastOutcome: row.last_outcome,
    providerMessageId: row.provider_message_id,
    errorMessage: row.error_message,
  };
}

function reviewStatusFromJob(row: {
  status: string;
  last_outcome: string | null;
}): SalesFollowUpReviewStatus {
  const outcome = String(row.last_outcome ?? "").toLowerCase();
  if (row.status === "cancelled" || outcome === "cancelled") return "cancelled";
  if (outcome === "sent") return "sent";
  if (outcome === "failed") return "failed";
  if (row.status === "completed" && outcome === "draft") return "pending_review";
  if (outcome === "draft") return "pending_review";
  return "failed";
}

function isDraftAwaitingReview(row: { status: string; last_outcome: string | null }): boolean {
  return row.status === "completed" && String(row.last_outcome ?? "").toLowerCase() === "draft";
}

/**
 * Invalidate completed drafts (and pending/claimed jobs) when a customer replies.
 * Historical sent/cancelled rows are preserved.
 */
export async function invalidateSalesFollowUpDraftsForConversation(
  client: SupabaseClient,
  input: { companyId: string; conversationId: string; reason?: string },
): Promise<number> {
  const reason = input.reason ?? "customer_replied";
  const now = new Date().toISOString();

  const { data: jobs, error } = await client
    .from("sales_follow_up_jobs")
    .update({
      last_outcome: "cancelled",
      error_message: reason,
      claim_owner: null,
      claimed_at: null,
      claim_expires_at: null,
      updated_at: now,
    })
    .eq("company_id", input.companyId)
    .eq("conversation_id", input.conversationId)
    .eq("status", "completed")
    .eq("last_outcome", "draft")
    .select("id, idempotency_key");
  if (error) throw new Error(error.message);

  const invalidated = Array.isArray(jobs) ? jobs.length : 0;
  if (invalidated === 0) return 0;

  const keys = (jobs ?? [])
    .map((job) => String(job.idempotency_key ?? ""))
    .filter(Boolean);
  if (keys.length > 0) {
    const { error: attemptError } = await client
      .from("sales_follow_up_attempts")
      .update({
        outcome: "cancelled",
        reason,
        updated_at: now,
      })
      .eq("company_id", input.companyId)
      .eq("outcome", "draft")
      .in("idempotency_key", keys);
    if (attemptError) throw new Error(attemptError.message);
  }

  return invalidated;
}

export async function listSalesFollowUpReviewItems(
  client: SupabaseClient,
  input: {
    companyId: string;
    status?: SalesFollowUpReviewStatus | "all";
    limit?: number;
  },
): Promise<SalesFollowUpReviewItem[]> {
  const limit = Math.max(1, Math.min(200, Math.trunc(input.limit ?? 50)));
  let query = client
    .from("sales_follow_up_jobs")
    .select(
      "id, company_id, lead_id, conversation_id, company_channel_id, external_thread_id, channel, attempt_number, due_at, created_at, message_text, idempotency_key, status, claim_owner, claimed_at, claim_expires_at, last_outcome, provider_message_id, error_message",
    )
    .eq("company_id", input.companyId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  const status = input.status ?? "pending_review";
  if (status === "pending_review") {
    query = query.eq("status", "completed").eq("last_outcome", "draft");
  } else if (status === "sent") {
    query = query.eq("last_outcome", "sent");
  } else if (status === "cancelled") {
    query = query.or("status.eq.cancelled,last_outcome.eq.cancelled");
  } else if (status === "failed") {
    query = query.eq("last_outcome", "failed");
  } else {
    // all: anything that is (or was) part of the follow-up review surface
    query = query.or(
      "and(status.eq.completed,last_outcome.eq.draft),last_outcome.eq.sent,last_outcome.eq.failed,status.eq.cancelled,last_outcome.eq.cancelled",
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as JobRow[];
  if (rows.length === 0) return [];

  const leadIds = [...new Set(rows.map((row) => row.lead_id))];
  const { data: leads, error: leadsError } = await client
    .from("leads")
    .select("id, title, contact_name, lifecycle_status, is_qualified, metadata")
    .eq("company_id", input.companyId)
    .in("id", leadIds);
  if (leadsError) throw new Error(leadsError.message);

  const leadById = new Map(
    (leads ?? []).map((lead) => [
      String(lead.id),
      lead as {
        id: string;
        title: string | null;
        contact_name: string | null;
        lifecycle_status: string | null;
        is_qualified: boolean | null;
        metadata: Record<string, unknown> | null;
      },
    ]),
  );

  return rows.map((row) => {
    const lead = leadById.get(row.lead_id);
    const metadata =
      lead?.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
    const interest =
      metadata.productInterest && typeof metadata.productInterest === "object"
        ? (metadata.productInterest as Record<string, unknown>)
        : null;
    return {
      jobId: row.id,
      companyId: row.company_id,
      leadId: row.lead_id,
      conversationId: row.conversation_id,
      channel: (row.channel as SalesFollowUpChannel | null) ?? null,
      attemptNumber: row.attempt_number,
      dueAt: row.due_at,
      createdAt: row.created_at ?? null,
      messageText: row.message_text ?? "",
      status: reviewStatusFromJob(row),
      lastOutcome: row.last_outcome,
      errorMessage: row.error_message,
      providerMessageId: row.provider_message_id,
      leadTitle: lead?.title ?? null,
      contactName: lead?.contact_name ?? null,
      productInterestName:
        typeof interest?.productName === "string"
          ? interest.productName
          : typeof metadata.productName === "string"
            ? metadata.productName
            : null,
      productInterestId:
        typeof interest?.productId === "string" ? interest.productId : null,
      lifecycleStatus: lead?.lifecycle_status ?? null,
      isQualified: lead?.is_qualified ?? null,
    };
  });
}

export async function updateSalesFollowUpDraftMessage(
  client: SupabaseClient,
  input: { companyId: string; jobId: string; messageText: string; actorUserId: string },
): Promise<{ updated: boolean; reason?: string }> {
  const text = input.messageText.trim();
  if (!text) return { updated: false, reason: "empty_message" };

  const { data, error } = await client
    .from("sales_follow_up_jobs")
    .update({
      message_text: text,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId)
    .eq("company_id", input.companyId)
    .eq("status", "completed")
    .eq("last_outcome", "draft")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return { updated: false, reason: "not_a_draft" };
  return { updated: true };
}

export async function rejectSalesFollowUpDraft(
  client: SupabaseClient,
  input: { companyId: string; jobId: string; reason?: string; actorUserId: string },
): Promise<{ rejected: boolean; reason?: string }> {
  const reason = input.reason?.trim() || "rejected_by_staff";
  const now = new Date().toISOString();

  const { data, error } = await client
    .from("sales_follow_up_jobs")
    .update({
      status: "cancelled",
      last_outcome: "cancelled",
      error_message: reason,
      claim_owner: null,
      claimed_at: null,
      claim_expires_at: null,
      updated_at: now,
    })
    .eq("id", input.jobId)
    .eq("company_id", input.companyId)
    .eq("status", "completed")
    .eq("last_outcome", "draft")
    .select("id, idempotency_key")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return { rejected: false, reason: "not_a_draft" };

  if (data.idempotency_key) {
    await client
      .from("sales_follow_up_attempts")
      .update({
        outcome: "cancelled",
        reason,
        updated_at: now,
      })
      .eq("company_id", input.companyId)
      .eq("idempotency_key", String(data.idempotency_key))
      .eq("outcome", "draft");
  }

  return { rejected: true };
}

export async function rescheduleSalesFollowUpDraft(
  client: SupabaseClient,
  input: { companyId: string; jobId: string; dueAt: Date; actorUserId: string },
): Promise<{ rescheduled: boolean; reason?: string }> {
  if (Number.isNaN(input.dueAt.getTime())) {
    return { rescheduled: false, reason: "invalid_due_at" };
  }
  const { data, error } = await client
    .from("sales_follow_up_jobs")
    .update({
      due_at: input.dueAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId)
    .eq("company_id", input.companyId)
    .eq("status", "completed")
    .eq("last_outcome", "draft")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return { rescheduled: false, reason: "not_a_draft" };
  return { rescheduled: true };
}

export type ApproveSalesFollowUpDraftDeps = {
  client: SupabaseClient;
  companyId: string;
  jobId: string;
  actorUserId: string;
  messageText?: string | null;
  allowProviderSend: boolean;
  delivery: SalesFollowUpDeliveryPort;
  attempts: SalesFollowUpAttemptStore;
  loadEligibility: (
    job: SalesFollowUpJobRecord,
    settings: SalesFollowUpSettings,
  ) => Promise<SalesFollowUpEligibilitySnapshot>;
  now?: Date;
};

export type ApproveSalesFollowUpDraftResult =
  | { ok: true; delivered: true; providerMessageId: string | null }
  | { ok: false; reason: string; cancelled?: boolean };

/**
 * Approve a draft and send via the existing delivery port.
 * Revalidates eligibility immediately before send; CAS prevents double-approve.
 */
export async function approveAndSendSalesFollowUpDraft(
  deps: ApproveSalesFollowUpDraftDeps,
): Promise<ApproveSalesFollowUpDraftResult> {
  const now = deps.now ?? new Date();
  const leaseMs = 120_000;
  const claimOwner = `approve:${deps.actorUserId}`;

  // CAS: only one approver can take a completed draft.
  const { data: claimed, error: claimError } = await deps.client
    .from("sales_follow_up_jobs")
    .update({
      claim_owner: claimOwner,
      claimed_at: now.toISOString(),
      claim_expires_at: new Date(now.getTime() + leaseMs).toISOString(),
      error_message: "approval_in_progress",
      updated_at: now.toISOString(),
    })
    .eq("id", deps.jobId)
    .eq("company_id", deps.companyId)
    .eq("status", "completed")
    .eq("last_outcome", "draft")
    .is("claim_owner", null)
    .select("*")
    .maybeSingle();

  if (claimError) throw new Error(claimError.message);

  let jobRow = claimed as JobRow | null;
  if (!jobRow) {
    // Allow reclaim of expired approval lease (crashed approve).
    const { data: existing, error: existingError } = await deps.client
      .from("sales_follow_up_jobs")
      .select("*")
      .eq("id", deps.jobId)
      .eq("company_id", deps.companyId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing || !isDraftAwaitingReview(existing as JobRow)) {
      return { ok: false, reason: "not_a_draft" };
    }
    const expires = existing.claim_expires_at
      ? new Date(String(existing.claim_expires_at)).getTime()
      : 0;
    if (existing.claim_owner && expires > now.getTime()) {
      return { ok: false, reason: "approval_in_progress" };
    }
    const { data: reclaimed, error: reclaimError } = await deps.client
      .from("sales_follow_up_jobs")
      .update({
        claim_owner: claimOwner,
        claimed_at: now.toISOString(),
        claim_expires_at: new Date(now.getTime() + leaseMs).toISOString(),
        error_message: "approval_in_progress",
        updated_at: now.toISOString(),
      })
      .eq("id", deps.jobId)
      .eq("company_id", deps.companyId)
      .eq("status", "completed")
      .eq("last_outcome", "draft")
      .select("*")
      .maybeSingle();
    if (reclaimError) throw new Error(reclaimError.message);
    if (!reclaimed) return { ok: false, reason: "not_a_draft" };
    jobRow = reclaimed as JobRow;
  }

  const releaseClaim = async (patch: Record<string, unknown>) => {
    await deps.client
      .from("sales_follow_up_jobs")
      .update({
        claim_owner: null,
        claimed_at: null,
        claim_expires_at: null,
        updated_at: new Date().toISOString(),
        ...patch,
      })
      .eq("id", deps.jobId)
      .eq("company_id", deps.companyId)
      .eq("claim_owner", claimOwner);
  };

  const edited = typeof deps.messageText === "string" ? deps.messageText.trim() : "";
  if (edited) {
    const { error: msgError } = await deps.client
      .from("sales_follow_up_jobs")
      .update({ message_text: edited, updated_at: now.toISOString() })
      .eq("id", deps.jobId)
      .eq("company_id", deps.companyId)
      .eq("claim_owner", claimOwner);
    if (msgError) {
      await releaseClaim({ error_message: msgError.message, last_outcome: "draft" });
      throw new Error(msgError.message);
    }
    jobRow.message_text = edited;
  }

  const messageText = String(jobRow.message_text ?? "").trim();
  if (!messageText) {
    await releaseClaim({ error_message: "empty_message", last_outcome: "draft" });
    return { ok: false, reason: "empty_message" };
  }

  if (!deps.allowProviderSend) {
    await releaseClaim({ error_message: "provider_send_disabled", last_outcome: "draft" });
    return { ok: false, reason: "provider_send_disabled" };
  }

  const job = mapJob(jobRow);
  const settings = await loadSalesFollowUpSettings(deps.client, deps.companyId);
  const eligibility = await deps.loadEligibility(job, settings);

  const decision = evaluateSalesFollowUp({
    companyId: job.companyId,
    leadId: job.leadId,
    attemptNumber: job.attemptNumber,
    dueAt: job.dueAt,
    now,
    settings: { ...settings, approvalMode: "automatic" },
    channel: job.channel,
    channelConnected: eligibility.channelConnected,
    channelCanSend: eligibility.channelCanSend,
    optedOut: eligibility.optedOut,
    customerRepliedAfterSchedule: eligibility.customerRepliedAfterSchedule,
    converted: eligibility.converted,
    purchased: eligibility.purchased,
    requestClosed: eligibility.requestClosed,
    assigneeChanged: eligibility.assigneeChanged,
    attemptsAlreadySent: eligibility.attemptsAlreadySent,
    companySentToday: eligibility.companySentToday,
    // Draft attempt already exists — ignore for human-approved re-send.
    idempotencyKeySeen: false,
    transientFailure: false,
    withinBusinessHours: true,
  });

  if (
    decision.outcome === "cancelled" ||
    decision.reason === "customer_replied" ||
    decision.reason === "converted" ||
    decision.reason === "purchased" ||
    decision.reason === "opt_out" ||
    decision.reason === "request_closed" ||
    decision.reason === "reassigned" ||
    decision.reason === "automation_disabled"
  ) {
    await releaseClaim({
      status: "cancelled",
      last_outcome: "cancelled",
      error_message: decision.reason,
    });
    await deps.attempts.record({
      companyId: job.companyId,
      leadId: job.leadId,
      idempotencyKey: job.idempotencyKey,
      channel: job.channel,
      outcome: "cancelled",
      reason: decision.reason,
      providerMessageId: null,
      errorMessage: null,
      conversationId: job.conversationId,
    });
    return { ok: false, reason: decision.reason, cancelled: true };
  }

  if (!job.channel || !job.conversationId || !job.companyChannelId || !job.externalThreadId) {
    await releaseClaim({ error_message: "channel_unavailable", last_outcome: "draft" });
    return { ok: false, reason: "channel_unavailable" };
  }

  if (!decision.send && decision.reason !== "eligible") {
    // Channel / readiness issues — keep as draft for another try.
    await releaseClaim({ error_message: decision.reason, last_outcome: "draft" });
    return { ok: false, reason: decision.reason };
  }

  const delivery = await deps.delivery.deliver({
    companyId: job.companyId,
    leadId: job.leadId,
    channel: job.channel,
    conversationId: job.conversationId,
    companyChannelId: job.companyChannelId,
    externalThreadId: job.externalThreadId,
    text: messageText,
    idempotencyKey: job.idempotencyKey,
  });

  if (delivery.status !== "delivered") {
    await releaseClaim({
      error_message: delivery.error,
      last_outcome: "draft",
    });
    await deps.attempts.record({
      companyId: job.companyId,
      leadId: job.leadId,
      idempotencyKey: job.idempotencyKey,
      channel: job.channel,
      outcome: delivery.retryable ? "retried" : "failed",
      reason: delivery.error,
      providerMessageId: null,
      errorMessage: delivery.error,
      conversationId: job.conversationId,
    });
    return { ok: false, reason: delivery.error };
  }

  // Promote draft attempt → sent (same idempotency key).
  await deps.attempts.record({
    companyId: job.companyId,
    leadId: job.leadId,
    idempotencyKey: job.idempotencyKey,
    channel: job.channel,
    outcome: "sent",
    reason: "approved_by_staff",
    providerMessageId: delivery.providerMessageId,
    errorMessage: null,
    conversationId: job.conversationId,
  });

  const { data: finalized, error: finalizeError } = await deps.client
    .from("sales_follow_up_jobs")
    .update({
      status: "completed",
      last_outcome: "sent",
      provider_message_id: delivery.providerMessageId,
      error_message: null,
      claim_owner: null,
      claimed_at: null,
      claim_expires_at: null,
      message_text: messageText,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deps.jobId)
    .eq("company_id", deps.companyId)
    .eq("claim_owner", claimOwner)
    .eq("last_outcome", "draft")
    .select("id")
    .maybeSingle();
  if (finalizeError) throw new Error(finalizeError.message);
  if (!finalized?.id) {
    // Another path cancelled/invalidated while sending — do not claim success in job row,
    // but delivery already happened; surface conflict.
    return { ok: false, reason: "stale_after_send" };
  }

  return { ok: true, delivered: true, providerMessageId: delivery.providerMessageId };
}
