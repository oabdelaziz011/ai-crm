/**
 * API-server logging wrapper around automation-platform qualify/cancel helpers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cancelSalesFollowUpAfterLeadStop as cancelCore,
  scheduleSalesFollowUpAfterLeadQualified as scheduleCore,
} from "@workspace/automation-platform";
import { logger } from "../lib/logger.js";

export async function scheduleSalesFollowUpAfterLeadQualified(
  client: SupabaseClient,
  input: { companyId: string; leadId: string },
): Promise<void> {
  try {
    const result = await scheduleCore(client, input);
    logger.info(
      {
        event: "sales.follow_up.schedule.result",
        companyId: input.companyId,
        leadId: input.leadId,
        ...result,
      },
      "Sales follow-up ladder schedule result",
    );
  } catch (error) {
    logger.error(
      {
        event: "sales.follow_up.schedule.error",
        companyId: input.companyId,
        leadId: input.leadId,
        err: error instanceof Error ? { message: error.message, name: error.name } : error,
      },
      "Sales follow-up schedule after qualify failed",
    );
  }
}

export async function cancelSalesFollowUpAfterLeadStop(
  client: SupabaseClient,
  input: { companyId: string; leadId: string; reason: string },
): Promise<void> {
  try {
    const cancelled = await cancelCore(client, input);
    if (cancelled > 0) {
      logger.info(
        {
          event: "sales.follow_up.cancel.lead",
          companyId: input.companyId,
          leadId: input.leadId,
          reason: input.reason,
          cancelled,
        },
        "Cancelled pending sales follow-up jobs for lead",
      );
    }
  } catch (error) {
    logger.error(
      {
        event: "sales.follow_up.cancel.error",
        companyId: input.companyId,
        leadId: input.leadId,
        err: error instanceof Error ? { message: error.message } : error,
      },
      "Cancel sales follow-up jobs failed",
    );
  }
}
