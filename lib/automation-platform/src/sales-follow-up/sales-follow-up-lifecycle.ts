/**
 * Lead / conversation lifecycle hooks for sales follow-up safety.
 * Cancels pending/claimed jobs when stop conditions fire.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSalesFollowUpSettings } from "./sales-follow-up-store.js";
import {
  cancelPendingSalesFollowUpJobsForLead,
  scheduleSalesFollowUpLadder,
} from "./sales-follow-up-orchestrate.js";
import { scheduleSalesFollowUpAfterLeadQualified } from "./sales-follow-up-after-qualify.js";
import { invalidateSalesFollowUpDraftsForConversation } from "./sales-follow-up-approval.js";

export type SalesFollowUpLeadLifecycleEvent = {
  type: string;
  companyId: string;
  leadId: string;
  payload?: Record<string, unknown>;
};

/** Cancel all open follow-up jobs for leads linked to this conversation. */
export async function cancelSalesFollowUpForConversation(
  client: SupabaseClient,
  input: { companyId: string; conversationId: string; reason?: string },
): Promise<number> {
  const reason = input.reason ?? "customer_replied";
  const settings = await loadSalesFollowUpSettings(client, input.companyId);
  if (settings.stopOnCustomerReply === false) {
    return 0;
  }

  const { data: leads, error } = await client
    .from("leads")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("conversation_id", input.conversationId);
  if (error) throw new Error(error.message);

  const leadIds = new Set((leads ?? []).map((lead) => String(lead.id)));

  // Cancel by conversation_id first (covers jobs even if lead link drifted).
  const { data: jobs, error: jobsError } = await client
    .from("sales_follow_up_jobs")
    .update({
      status: "cancelled",
      last_outcome: "cancelled",
      error_message: reason,
      claim_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", input.companyId)
    .eq("conversation_id", input.conversationId)
    .in("status", ["pending", "claimed"])
    .select("id, lead_id");
  if (jobsError) throw new Error(jobsError.message);

  let cancelled = Array.isArray(jobs) ? jobs.length : 0;
  for (const job of jobs ?? []) {
    leadIds.delete(String(job.lead_id));
  }

  // Cancel any remaining open jobs for linked leads that used a different conversation_id.
  for (const leadId of leadIds) {
    cancelled += await cancelPendingSalesFollowUpJobsForLead(client, {
      companyId: input.companyId,
      leadId,
      reason,
    });
  }

  // Completed drafts awaiting human approval must not remain sendable after a reply.
  cancelled += await invalidateSalesFollowUpDraftsForConversation(client, {
    companyId: input.companyId,
    conversationId: input.conversationId,
    reason,
  });

  return cancelled;
}

/**
 * React to lead domain events. Safe to call twice (cancel/schedule are idempotent).
 */
export async function handleSalesFollowUpLeadLifecycleEvent(
  client: SupabaseClient,
  event: SalesFollowUpLeadLifecycleEvent,
): Promise<{ action: string; detail?: string }> {
  const settings = await loadSalesFollowUpSettings(client, event.companyId);

  switch (event.type) {
    case "lead_qualified": {
      if (!settings.enabled) return { action: "skipped", detail: "automation_disabled" };
      const result = await scheduleSalesFollowUpAfterLeadQualified(client, {
        companyId: event.companyId,
        leadId: event.leadId,
      });
      return { action: "schedule", detail: "scheduled" in result ? String(result.reason) : "ok" };
    }
    case "lead_disqualified": {
      if (settings.stopOnClosedRequest === false) return { action: "skipped", detail: "policy_off" };
      const n = await cancelPendingSalesFollowUpJobsForLead(client, {
        companyId: event.companyId,
        leadId: event.leadId,
        reason: "disqualified",
      });
      return { action: "cancel", detail: `cancelled=${n}` };
    }
    case "lead_converted": {
      if (settings.stopOnConversion === false) return { action: "skipped", detail: "policy_off" };
      const n = await cancelPendingSalesFollowUpJobsForLead(client, {
        companyId: event.companyId,
        leadId: event.leadId,
        reason: "converted",
      });
      return { action: "cancel", detail: `cancelled=${n}` };
    }
    case "lead_reassigned": {
      if (settings.stopOnReassignment === false) return { action: "skipped", detail: "policy_off" };
      const n = await cancelPendingSalesFollowUpJobsForLead(client, {
        companyId: event.companyId,
        leadId: event.leadId,
        reason: "reassigned",
      });
      return { action: "cancel", detail: `cancelled=${n}` };
    }
    case "lead_archived": {
      if (settings.stopOnClosedRequest === false) return { action: "skipped", detail: "policy_off" };
      const n = await cancelPendingSalesFollowUpJobsForLead(client, {
        companyId: event.companyId,
        leadId: event.leadId,
        reason: "archived",
      });
      return { action: "cancel", detail: `cancelled=${n}` };
    }
    default:
      return { action: "ignored" };
  }
}

/** Convenience for tests: schedule ladder without qualify path. */
export async function scheduleSalesFollowUpLadderForTests(
  client: SupabaseClient,
  input: Parameters<typeof scheduleSalesFollowUpLadder>[1],
) {
  return scheduleSalesFollowUpLadder(client, input);
}
