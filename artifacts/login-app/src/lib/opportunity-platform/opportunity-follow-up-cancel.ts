import type { SupabaseClient } from "@supabase/supabase-js";

/** Login-app owns Opportunity won/lost writes; API server has no lifecycle write path. */
export function opportunityFollowUpCancelReason(
  lifecycle: "won" | "lost",
): "opportunity_won" | "opportunity_lost" {
  return lifecycle === "won" ? "opportunity_won" : "opportunity_lost";
}

/**
 * Cancels pending sales follow-ups after OpportunityWon / OpportunityLost.
 * Failures are reported (not swallowed silently) but do not fail the lifecycle publish.
 */
export async function cancelSalesFollowUpsAfterOpportunityLifecycle(
  client: SupabaseClient | undefined,
  input: { companyId: string; opportunityId: string; lifecycle: "won" | "lost" },
  options?: { onError?: (error: unknown) => void },
): Promise<number> {
  if (!client) return 0;
  try {
    const { cancelSalesFollowUpForOpportunity } = await import("@workspace/automation-platform");
    return await cancelSalesFollowUpForOpportunity(client, {
      companyId: input.companyId,
      opportunityId: input.opportunityId,
      reason: opportunityFollowUpCancelReason(input.lifecycle),
    });
  } catch (error) {
    if (options?.onError) options.onError(error);
    else {
      console.warn(
        "[opportunity-event-bridge] sales follow-up cancel after opportunity lifecycle failed",
        error instanceof Error ? error.message : error,
      );
    }
    return 0;
  }
}
