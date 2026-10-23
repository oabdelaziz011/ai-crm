/**
 * Schedule / cancel sales follow-up job ladders for a lead.
 * Message text is left empty at enqueue time and composed at claim/send time.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeSalesFollowUpSettings,
  type SalesFollowUpChannel,
  type SalesFollowUpSettings,
} from "./sales-follow-up.js";
import { enqueueSalesFollowUpJob, type SalesFollowUpJobRecord } from "./sales-follow-up-jobs.js";
import { loadSalesFollowUpSettings } from "./sales-follow-up-store.js";
import {
  alignDueAtToBusinessHours,
  computeSalesFollowUpDueAt,
  salesFollowUpScheduleSteps,
} from "./sales-follow-up-schedule.js";

export type ScheduleSalesFollowUpLadderInput = {
  companyId: string;
  leadId: string;
  conversationId?: string | null;
  companyChannelId?: string | null;
  externalThreadId?: string | null;
  channel?: SalesFollowUpChannel | null;
  /** Anchor for relative delays (qualification time / last customer message). */
  anchorAt?: Date;
  now?: Date;
};

export type ScheduleSalesFollowUpLadderResult = {
  scheduled: boolean;
  reason: string;
  jobs: SalesFollowUpJobRecord[];
  createdCount: number;
};

export async function cancelPendingSalesFollowUpJobsForCompany(
  client: SupabaseClient,
  companyId: string,
  reason = "automation_disabled",
): Promise<number> {
  const { data, error } = await client
    .from("sales_follow_up_jobs")
    .update({
      status: "cancelled",
      last_outcome: "cancelled",
      error_message: reason,
      claim_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .in("status", ["pending", "claimed"])
    .select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.length : 0;
}

export async function cancelPendingSalesFollowUpJobsForLead(
  client: SupabaseClient,
  input: { companyId: string; leadId: string; reason: string },
): Promise<number> {
  const { data, error } = await client
    .from("sales_follow_up_jobs")
    .update({
      status: "cancelled",
      last_outcome: "cancelled",
      error_message: input.reason,
      claim_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", input.companyId)
    .eq("lead_id", input.leadId)
    .in("status", ["pending", "claimed"])
    .select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.length : 0;
}

export async function scheduleSalesFollowUpLadder(
  client: SupabaseClient,
  input: ScheduleSalesFollowUpLadderInput,
  settingsOverride?: SalesFollowUpSettings,
): Promise<ScheduleSalesFollowUpLadderResult> {
  const settings = normalizeSalesFollowUpSettings(
    settingsOverride ?? (await loadSalesFollowUpSettings(client, input.companyId)),
  );
  if (!settings.enabled) {
    return { scheduled: false, reason: "automation_disabled", jobs: [], createdCount: 0 };
  }
  if (!settings.channels.length) {
    return { scheduled: false, reason: "no_channels", jobs: [], createdCount: 0 };
  }

  // Idempotent: do not create a second active ladder for the same lead.
  const { count: activeCount, error: activeError } = await client
    .from("sales_follow_up_jobs")
    .select("id", { count: "exact", head: true })
    .eq("company_id", input.companyId)
    .eq("lead_id", input.leadId)
    .in("status", ["pending", "claimed"]);
  if (activeError) throw new Error(activeError.message);
  if ((activeCount ?? 0) > 0) {
    return {
      scheduled: false,
      reason: "already_scheduled",
      jobs: [],
      createdCount: 0,
    };
  }

  const channel =
    input.channel && settings.channels.includes(input.channel)
      ? input.channel
      : settings.channels[0] ?? null;
  if (!channel) {
    return { scheduled: false, reason: "no_channels", jobs: [], createdCount: 0 };
  }

  const anchor = input.anchorAt ?? input.now ?? new Date();
  const now = input.now ?? new Date();
  const steps = salesFollowUpScheduleSteps(settings).filter((step) => step.enabled);
  const jobs: SalesFollowUpJobRecord[] = [];
  let createdCount = 0;

  for (const step of steps) {
    let dueAt = computeSalesFollowUpDueAt(anchor, step.attemptNumber, settings);
    dueAt = alignDueAtToBusinessHours(dueAt, settings);
    if (dueAt.getTime() < now.getTime()) {
      // Never schedule steps already in the past relative to now.
      continue;
    }
    const { job, created } = await enqueueSalesFollowUpJob(client, {
      companyId: input.companyId,
      leadId: input.leadId,
      conversationId: input.conversationId ?? null,
      companyChannelId: input.companyChannelId ?? null,
      externalThreadId: input.externalThreadId ?? null,
      channel,
      attemptNumber: step.attemptNumber,
      dueAt,
      messageText: "",
    });
    if (job) jobs.push(job);
    if (created) createdCount += 1;
  }

  return {
    scheduled: createdCount > 0 || jobs.length > 0,
    reason: createdCount > 0 ? "ladder_scheduled" : jobs.length > 0 ? "already_scheduled" : "no_future_steps",
    jobs,
    createdCount,
  };
}
