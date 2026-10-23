import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateSalesFollowUp,
  salesFollowUpIdempotencyKey,
  type SalesFollowUpChannel,
  type SalesFollowUpOutcome,
  type SalesFollowUpSettings,
} from "./sales-follow-up.js";
import { loadSalesFollowUpSettings } from "./sales-follow-up-store.js";
import {
  executeSalesFollowUpAttempt,
  type SalesFollowUpAttemptStore,
  type SalesFollowUpDeliveryPort,
  type ExecuteSalesFollowUpResult,
} from "./sales-follow-up-executor.js";
import { alignDueAtToBusinessHours } from "./sales-follow-up-schedule.js";
import { cancelPendingSalesFollowUpJobsForLead } from "./sales-follow-up-orchestrate.js";

export type SalesFollowUpJobRecord = {
  id: string;
  companyId: string;
  leadId: string;
  conversationId: string | null;
  companyChannelId: string | null;
  externalThreadId: string | null;
  channel: SalesFollowUpChannel | null;
  attemptNumber: number;
  dueAt: Date;
  /** When the job row was created (schedule time). Used for reply-since window. */
  createdAt: Date | null;
  messageText: string;
  idempotencyKey: string;
  status: "pending" | "claimed" | "completed" | "cancelled";
  claimOwner: string | null;
  claimedAt: Date | null;
  claimExpiresAt: Date | null;
  lastOutcome: string | null;
  providerMessageId: string | null;
  errorMessage: string | null;
};

export type EnqueueSalesFollowUpJobInput = {
  companyId: string;
  leadId: string;
  conversationId?: string | null;
  companyChannelId?: string | null;
  externalThreadId?: string | null;
  channel?: SalesFollowUpChannel | null;
  attemptNumber?: number;
  dueAt: Date;
  messageText: string;
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

export async function enqueueSalesFollowUpJob(
  client: SupabaseClient,
  input: EnqueueSalesFollowUpJobInput,
): Promise<{ job: SalesFollowUpJobRecord | null; created: boolean }> {
  const attemptNumber = Math.max(1, Math.trunc(input.attemptNumber ?? 1));
  // Active-step uniqueness: do not create another pending/claimed row for the same
  // lead attempt when a prior schedule used a different dueAt (qualify race).
  const { data: activeStep, error: activeError } = await client
    .from("sales_follow_up_jobs")
    .select("*")
    .eq("company_id", input.companyId)
    .eq("lead_id", input.leadId)
    .eq("attempt_number", attemptNumber)
    .in("status", ["pending", "claimed"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (activeError) throw new Error(activeError.message);
  if (activeStep) {
    return { job: mapJob(activeStep as JobRow), created: false };
  }

  const idempotencyKey = salesFollowUpIdempotencyKey(
    input.companyId,
    input.leadId,
    attemptNumber,
    input.dueAt,
  );
  const { data, error } = await client
    .from("sales_follow_up_jobs")
    .insert({
      company_id: input.companyId,
      lead_id: input.leadId,
      conversation_id: input.conversationId ?? null,
      company_channel_id: input.companyChannelId ?? null,
      external_thread_id: input.externalThreadId ?? null,
      channel: input.channel ?? null,
      attempt_number: attemptNumber,
      due_at: input.dueAt.toISOString(),
      message_text: input.messageText,
      idempotency_key: idempotencyKey,
      status: "pending",
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      const existing = await client
        .from("sales_follow_up_jobs")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      return {
        job: existing.data ? mapJob(existing.data as JobRow) : null,
        created: false,
      };
    }
    throw new Error(error.message);
  }
  return { job: data ? mapJob(data as JobRow) : null, created: true };
}

export async function claimDueSalesFollowUpJobs(
  client: SupabaseClient,
  input: { limit?: number; claimOwner?: string; leaseSeconds?: number } = {},
): Promise<SalesFollowUpJobRecord[]> {
  const { data, error } = await client.rpc("claim_sales_follow_up_jobs", {
    p_limit: input.limit ?? 25,
    p_claim_owner: input.claimOwner ?? "worker",
    p_lease_seconds: input.leaseSeconds ?? 120,
  });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []).map((row) => mapJob(row as JobRow));
}

export async function completeSalesFollowUpJob(
  client: SupabaseClient,
  input: {
    jobId: string;
    companyId: string;
    outcome: SalesFollowUpOutcome | string;
    providerMessageId?: string | null;
    errorMessage?: string | null;
    cancel?: boolean;
  },
): Promise<void> {
  const { error } = await client
    .from("sales_follow_up_jobs")
    .update({
      status: input.cancel ? "cancelled" : "completed",
      last_outcome: input.outcome,
      provider_message_id: input.providerMessageId ?? null,
      error_message: input.errorMessage ?? null,
      claim_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId)
    .eq("company_id", input.companyId)
    // A job cancelled while a worker held it must stay cancelled (no cancelled → completed resurrection).
    .neq("status", "cancelled");
  if (error) throw new Error(error.message);
}

export type SalesFollowUpEligibilitySnapshot = {
  optedOut: boolean;
  customerRepliedAfterSchedule: boolean;
  converted: boolean;
  purchased: boolean;
  requestClosed: boolean;
  assigneeChanged: boolean;
  attemptsAlreadySent: number;
  companySentToday: number;
  channelConnected: boolean;
  channelCanSend: boolean;
  withinBusinessHours: boolean;
};

export type ProcessClaimedSalesFollowUpJobInput = {
  job: SalesFollowUpJobRecord;
  settings: SalesFollowUpSettings;
  eligibility: SalesFollowUpEligibilitySnapshot;
  now?: Date;
  delivery: SalesFollowUpDeliveryPort;
  attempts: SalesFollowUpAttemptStore;
  allowProviderSend: boolean;
  /**
   * Compose unique message text when job.messageText is empty.
   * Called only when the attempt is otherwise eligible to send/draft.
   */
  resolveMessage?: (job: SalesFollowUpJobRecord, settings: SalesFollowUpSettings) => Promise<string>;
  /** Persist composed text before provider call so retries do not regenerate a second message. */
  persistJobMessage?: (jobId: string, companyId: string, messageText: string) => Promise<void>;
};

/**
 * Rechecks company settings + eligibility, then runs the executor.
 * When allowProviderSend is false, delivery is never invoked (safe test/default mode).
 */
export async function processClaimedSalesFollowUpJob(
  input: ProcessClaimedSalesFollowUpJobInput,
): Promise<ExecuteSalesFollowUpResult> {
  if (!input.settings.enabled) {
    return {
      decision: {
        outcome: "skipped",
        reason: "automation_disabled",
        send: false,
        idempotencyKey: input.job.idempotencyKey,
      },
      recordedOutcome: "skipped",
      providerMessageId: null,
      delivered: false,
    };
  }

  const blockedDelivery: SalesFollowUpDeliveryPort = {
    async deliver() {
      return {
        status: "failed",
        retryable: false,
        error: "provider_send_disabled_by_environment",
      };
    },
  };

  const snapshotBase = {
    companyId: input.job.companyId,
    leadId: input.job.leadId,
    attemptNumber: input.job.attemptNumber,
    dueAt: input.job.dueAt,
    now: input.now ?? new Date(),
    settings: input.settings,
    channel: input.job.channel,
    channelConnected: input.eligibility.channelConnected,
    channelCanSend: input.eligibility.channelCanSend && input.allowProviderSend,
    optedOut: input.eligibility.optedOut,
    customerRepliedAfterSchedule: input.eligibility.customerRepliedAfterSchedule,
    converted: input.eligibility.converted,
    purchased: input.eligibility.purchased,
    requestClosed: input.eligibility.requestClosed,
    assigneeChanged: input.eligibility.assigneeChanged,
    attemptsAlreadySent: input.eligibility.attemptsAlreadySent,
    companySentToday: input.eligibility.companySentToday,
    idempotencyKeySeen: false,
    transientFailure: false,
    withinBusinessHours: input.eligibility.withinBusinessHours,
  };
  const preDecision = evaluateSalesFollowUp(snapshotBase);
  const needsMessage = preDecision.send || preDecision.outcome === "draft";

  let messageText = (input.job.messageText ?? "").trim();
  if (needsMessage && !messageText && typeof input.resolveMessage === "function") {
    messageText = (await input.resolveMessage(input.job, input.settings)).trim();
    if (messageText && typeof input.persistJobMessage === "function") {
      await input.persistJobMessage(input.job.id, input.job.companyId, messageText);
    }
  }
  if (needsMessage && !messageText) {
    return {
      decision: {
        outcome: "failed",
        reason: "empty_message",
        send: false,
        idempotencyKey: input.job.idempotencyKey,
      },
      recordedOutcome: "failed",
      providerMessageId: null,
      delivered: false,
    };
  }

  return executeSalesFollowUpAttempt({
    snapshot: snapshotBase,
    conversationId: input.job.conversationId ?? "",
    companyChannelId: input.job.companyChannelId ?? "",
    externalThreadId: input.job.externalThreadId ?? "",
    messageText: messageText || "(skipped)",
    delivery: input.allowProviderSend ? input.delivery : blockedDelivery,
    attempts: input.attempts,
  });
}

export type SalesFollowUpTickDeps = {
  client: SupabaseClient;
  delivery: SalesFollowUpDeliveryPort;
  attempts: SalesFollowUpAttemptStore;
  allowProviderSend: boolean;
  claimOwner?: string;
  limit?: number;
  loadEligibility: (
    job: SalesFollowUpJobRecord,
    settings: SalesFollowUpSettings,
  ) => Promise<SalesFollowUpEligibilitySnapshot>;
  resolveMessage?: (job: SalesFollowUpJobRecord, settings: SalesFollowUpSettings) => Promise<string>;
  now?: Date;
};

export type SalesFollowUpTickResult = {
  claimed: number;
  processed: number;
  delivered: number;
  failures: number;
  results: Array<{
    jobId: string;
    companyId: string;
    leadId: string;
    recordedOutcome: string;
    delivered: boolean;
    error?: string;
  }>;
};

/** One scheduler tick: claim a batch, process each job independently. */
export async function processSalesFollowUpTick(deps: SalesFollowUpTickDeps): Promise<SalesFollowUpTickResult> {
  const claimed = await claimDueSalesFollowUpJobs(deps.client, {
    limit: deps.limit ?? 25,
    claimOwner: deps.claimOwner ?? "sales-follow-up-worker",
  });
  const results: SalesFollowUpTickResult["results"] = [];
  let delivered = 0;
  let failures = 0;

  for (const job of claimed) {
    try {
      const settings = await loadSalesFollowUpSettings(deps.client, job.companyId);
      if (!settings.enabled) {
        await completeSalesFollowUpJob(deps.client, {
          jobId: job.id,
          companyId: job.companyId,
          outcome: "skipped",
          errorMessage: "automation_disabled",
          cancel: true,
        });
        results.push({
          jobId: job.id,
          companyId: job.companyId,
          leadId: job.leadId,
          recordedOutcome: "skipped",
          delivered: false,
        });
        continue;
      }

      const eligibility = await deps.loadEligibility(job, settings);
      const executed = await processClaimedSalesFollowUpJob({
        job,
        settings,
        eligibility,
        now: deps.now,
        delivery: deps.delivery,
        attempts: deps.attempts,
        allowProviderSend: deps.allowProviderSend,
        resolveMessage: deps.resolveMessage,
        persistJobMessage: async (jobId, companyId, messageText) => {
          const { error } = await deps.client
            .from("sales_follow_up_jobs")
            .update({ message_text: messageText, updated_at: new Date().toISOString() })
            .eq("id", jobId)
            .eq("company_id", companyId);
          if (error) throw new Error(error.message);
        },
      });

      // Outside business hours: defer to next open window instead of completing as skipped.
      if (executed.decision.reason === "outside_business_hours") {
        const nextDue = alignDueAtToBusinessHours(deps.now ?? new Date(), settings);
        const { error: deferError } = await deps.client
          .from("sales_follow_up_jobs")
          .update({
            status: "pending",
            due_at: nextDue.toISOString(),
            claim_owner: null,
            claimed_at: null,
            claim_expires_at: null,
            last_outcome: "scheduled",
            error_message: "outside_business_hours",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("company_id", job.companyId);
        if (deferError) throw new Error(deferError.message);
        results.push({
          jobId: job.id,
          companyId: job.companyId,
          leadId: job.leadId,
          recordedOutcome: "scheduled",
          delivered: false,
        });
        continue;
      }

      // Transient provider failure: release claim for bounded reclaim — do not mark completed.
      if (executed.recordedOutcome === "retried") {
        const retryDue = new Date((deps.now ?? new Date()).getTime() + 5 * 60 * 1000);
        const { error: retryError } = await deps.client
          .from("sales_follow_up_jobs")
          .update({
            status: "pending",
            due_at: retryDue.toISOString(),
            claim_owner: null,
            claimed_at: null,
            claim_expires_at: null,
            last_outcome: "retried",
            error_message: executed.decision.reason,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("company_id", job.companyId);
        if (retryError) throw new Error(retryError.message);
        results.push({
          jobId: job.id,
          companyId: job.companyId,
          leadId: job.leadId,
          recordedOutcome: "retried",
          delivered: false,
        });
        continue;
      }

      await completeSalesFollowUpJob(deps.client, {
        jobId: job.id,
        companyId: job.companyId,
        outcome: executed.recordedOutcome,
        providerMessageId: executed.providerMessageId,
        errorMessage: executed.delivered ? null : executed.decision.reason,
        cancel: executed.recordedOutcome === "cancelled",
      });

      // Stop-condition outcomes cancel sibling pending/claimed jobs for the same lead.
      const stopReasons = new Set([
        "customer_replied",
        "converted",
        "purchased",
        "opt_out",
        "request_closed",
        "reassigned",
        "disqualified",
      ]);
      if (
        executed.recordedOutcome === "cancelled" ||
        stopReasons.has(executed.decision.reason)
      ) {
        await cancelPendingSalesFollowUpJobsForLead(deps.client, {
          companyId: job.companyId,
          leadId: job.leadId,
          reason: executed.decision.reason,
        });
      }

      if (executed.delivered) delivered += 1;
      results.push({
        jobId: job.id,
        companyId: job.companyId,
        leadId: job.leadId,
        recordedOutcome: executed.recordedOutcome,
        delivered: executed.delivered,
      });
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : "tick_item_failed";
      // Release claim so lease reclaim / retry can proceed — avoid permanent stuck+completed on tick crash.
      try {
        const { error: releaseError } = await deps.client
          .from("sales_follow_up_jobs")
          .update({
            status: "pending",
            claim_owner: null,
            claimed_at: null,
            claim_expires_at: null,
            last_outcome: "failed",
            error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("company_id", job.companyId)
          .eq("status", "claimed");
        if (releaseError) throw new Error(releaseError.message);
      } catch {
        // Keep processing remaining jobs.
      }
      results.push({
        jobId: job.id,
        companyId: job.companyId,
        leadId: job.leadId,
        recordedOutcome: "failed",
        delivered: false,
        error: message,
      });
    }
  }

  return {
    claimed: claimed.length,
    processed: results.length,
    delivered,
    failures,
    results,
  };
}
