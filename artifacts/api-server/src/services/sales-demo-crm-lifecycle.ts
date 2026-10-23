/**
 * Slice D — link sales_demo bookings to CRM without inventing stages or SQL lifecycle writes.
 *
 * - Demo booked → changeLeadStage(demo_scheduled) via LeadCommandService (with safe hop via contacted).
 * - Human Complete Demo → demo_completed (never auto-creates an Opportunity; never implies proposal_sent).
 * - Booking alone / elapsed time never marks completion.
 * - proposal_sent remains tied to a successful quote/proposal send, not demo completion.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEAD_PERMISSIONS,
  createLeadPlatformServices,
  isOpenLeadLifecycle,
  isStageTransitionAllowed,
  type LeadLifecycleStatus,
  type LeadPlatformServices,
  type LeadRecord,
  type LeadServiceContext,
} from "@workspace/lead-platform";
import { cancelSalesFollowUpAfterLeadStop } from "./sales-follow-up-schedule-on-qualify.js";
import { logger } from "../lib/logger.js";

const DEMO_AGENT_PERMISSIONS: ReadonlySet<string> = new Set([
  LEAD_PERMISSIONS.view,
  LEAD_PERMISSIONS.edit,
  LEAD_PERMISSIONS.qualify,
  LEAD_PERMISSIONS.manage,
]);

/** A failed or customer-less booking must not move the lead. */
export function demoBookingShouldSyncCrm(input: {
  success?: boolean;
  bookingId?: string | null;
  customerId?: string | null;
}): boolean {
  return input.success === true && Boolean(input.bookingId) && Boolean(input.customerId);
}

export type SalesDemoCrmLifecycleResult = {
  ok: boolean;
  leadId: string | null;
  bookingId: string;
  lifecycleStatus: string | null;
  alreadyDemoScheduled?: boolean;
  linkedOnly?: boolean;
  reason?: string;
};

function buildCtx(userId: string, companyId: string): LeadServiceContext {
  return {
    userId,
    companyId,
    isSuperAdmin: false,
    hasPermission: (code: string) => DEMO_AGENT_PERMISSIONS.has(code),
  };
}

async function findOpenLeadForCustomer(
  client: SupabaseClient,
  companyId: string,
  customerId: string,
): Promise<{ id: string; lifecycle_status: string; pipeline_id: string; conversation_id: string | null } | null> {
  const { data, error } = await client
    .from("leads")
    .select("id, lifecycle_status, pipeline_id, conversation_id")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  const open = (data ?? []).find((row) => isOpenLeadLifecycle(String(row.lifecycle_status ?? "")));
  return open
    ? {
        id: String(open.id),
        lifecycle_status: String(open.lifecycle_status ?? "new"),
        pipeline_id: String(open.pipeline_id),
        conversation_id: open.conversation_id ? String(open.conversation_id) : null,
      }
    : null;
}

async function findOpenLeadForConversation(
  client: SupabaseClient,
  companyId: string,
  conversationId: string,
): Promise<{ id: string; lifecycle_status: string; pipeline_id: string; conversation_id: string | null } | null> {
  const { data, error } = await client
    .from("leads")
    .select("id, lifecycle_status, pipeline_id, conversation_id")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  const open = (data ?? []).find((row) => isOpenLeadLifecycle(String(row.lifecycle_status ?? "")));
  return open
    ? {
        id: String(open.id),
        lifecycle_status: String(open.lifecycle_status ?? "new"),
        pipeline_id: String(open.pipeline_id),
        conversation_id: open.conversation_id ? String(open.conversation_id) : null,
      }
    : null;
}

async function resolveStageId(
  platform: LeadPlatformServices,
  ctx: LeadServiceContext,
  companyId: string,
  pipelineId: string,
  lifecycleStatus: LeadLifecycleStatus,
): Promise<string | null> {
  const { stages } = await platform.queries.listStages(ctx, { companyId, pipelineId });
  const match = stages.find((s) => s.lifecycleStatus === lifecycleStatus);
  return match?.id ?? null;
}

async function changeToLifecycle(
  platform: LeadPlatformServices,
  ctx: LeadServiceContext,
  companyId: string,
  leadId: string,
  pipelineId: string,
  target: LeadLifecycleStatus,
  audit: { source: "ai" | "human" | "system"; reason: string },
): Promise<LeadRecord> {
  const stageId = await resolveStageId(platform, ctx, companyId, pipelineId, target);
  if (!stageId) {
    throw new Error(`No pipeline stage with lifecycle ${target}`);
  }
  const { lead } = await platform.commands.changeLeadStage(ctx, {
    companyId,
    leadId,
    stageId,
    stageAudit: audit,
  });
  return lead;
}

/**
 * Advance an open lead to demo_scheduled without auto-qualifying.
 * May hop new → contacted → demo_scheduled when the pipeline forbids a direct jump.
 */
export async function advanceLeadToDemoScheduled(
  platform: LeadPlatformServices,
  ctx: LeadServiceContext,
  lead: { id: string; lifecycleStatus: string; pipelineId: string },
): Promise<{ lead: LeadRecord; already: boolean; hoppedViaContacted: boolean }> {
  const companyId = ctx.companyId!;
  const from = lead.lifecycleStatus as LeadLifecycleStatus;
  if (from === "demo_scheduled") {
    const current = await platform.queries.getLead(ctx, { companyId, leadId: lead.id });
    if (!current.lead) throw new Error("Lead not found");
    return { lead: current.lead, already: true, hoppedViaContacted: false };
  }

  if (isStageTransitionAllowed(from, "demo_scheduled")) {
    const next = await changeToLifecycle(platform, ctx, companyId, lead.id, lead.pipelineId, "demo_scheduled", {
      source: "system",
      reason: "demo_booking_confirmed",
    });
    return { lead: next, already: false, hoppedViaContacted: false };
  }

  if (
    isStageTransitionAllowed(from, "contacted") &&
    isStageTransitionAllowed("contacted", "demo_scheduled")
  ) {
    await changeToLifecycle(platform, ctx, companyId, lead.id, lead.pipelineId, "contacted", {
      source: "system",
      reason: "demo_booking_confirmed",
    });
    const next = await changeToLifecycle(
      platform,
      ctx,
      companyId,
      lead.id,
      lead.pipelineId,
      "demo_scheduled",
      { source: "system", reason: "demo_booking_confirmed" },
    );
    return { lead: next, already: false, hoppedViaContacted: true };
  }

  throw new Error(`Cannot advance ${from} to demo_scheduled under default transitions`);
}

/**
 * Human-authorized demo completion: demo_scheduled → demo_completed.
 * Does not create an Opportunity and does not send outbound messages.
 * Company/tenant must come from authenticated LeadServiceContext (asserted against input).
 */
export async function completeSalesDemo(
  platform: LeadPlatformServices,
  ctx: LeadServiceContext,
  input: { leadId: string; companyId?: string },
): Promise<{ lead: LeadRecord }> {
  const companyId = ctx.companyId;
  if (!companyId) throw new Error("Authenticated company context is required");
  if (input.companyId && input.companyId !== companyId) {
    throw new Error("companyId must match authenticated company context");
  }

  const existing = await platform.queries.getLead(ctx, {
    companyId,
    leadId: input.leadId,
  });
  if (!existing.lead) throw new Error("Lead not found");
  if (existing.lead.lifecycleStatus === "demo_completed") {
    return { lead: existing.lead };
  }
  if (existing.lead.lifecycleStatus !== "demo_scheduled") {
    throw new Error(
      `Lead must be demo_scheduled to complete a demo (current=${existing.lead.lifecycleStatus})`,
    );
  }
  const lead = await changeToLifecycle(
    platform,
    ctx,
    companyId,
    input.leadId,
    existing.lead.pipelineId,
    "demo_completed",
    { source: "human", reason: "demo_completed_authorized" },
  );
  return { lead };
}

/**
 * @deprecated Use completeSalesDemo (demo_scheduled → demo_completed). Kept for test migration.
 */
export async function completeSalesDemoAsProposalSent(
  platform: LeadPlatformServices,
  ctx: LeadServiceContext,
  input: { companyId: string; leadId: string },
): Promise<{ lead: LeadRecord }> {
  return completeSalesDemo(platform, ctx, { leadId: input.leadId, companyId: input.companyId });
}

export async function syncSalesDemoBookingToCrm(
  client: SupabaseClient,
  input: {
    companyId: string;
    userId: string;
    customerId: string;
    bookingId: string;
    conversationId?: string | null;
  },
  platformFactory: (c: SupabaseClient) => LeadPlatformServices = createLeadPlatformServices,
): Promise<SalesDemoCrmLifecycleResult> {
  const platform = platformFactory(client);
  const ctx = buildCtx(input.userId, input.companyId);

  let leadRow =
    (input.conversationId
      ? await findOpenLeadForConversation(client, input.companyId, input.conversationId)
      : null) ?? (await findOpenLeadForCustomer(client, input.companyId, input.customerId));

  if (!leadRow) {
    logger.info(
      {
        event: "sales.demo.crm.no_open_lead",
        companyId: input.companyId,
        bookingId: input.bookingId,
      },
      "Demo booked but no open lead to advance",
    );
    return {
      ok: false,
      leadId: null,
      bookingId: input.bookingId,
      lifecycleStatus: null,
      reason: "no_open_lead",
    };
  }

  // Link booking ↔ lead (+ conversation when known). Soft-fail link errors.
  // Prefer product_demo_bookings (dedicated domain); fall back to legacy scheduling_bookings.
  const linkPayload: Record<string, unknown> = {
    lead_id: leadRow.id,
    updated_by: input.userId,
  };
  const conversationId = input.conversationId ?? leadRow.conversation_id;
  if (conversationId) linkPayload.conversation_id = conversationId;
  const productLink = await client
    .from("product_demo_bookings")
    .update(linkPayload)
    .eq("id", input.bookingId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (!productLink.data) {
    const { error: linkError } = await client
      .from("scheduling_bookings")
      .update(linkPayload)
      .eq("id", input.bookingId)
      .eq("company_id", input.companyId)
      .is("deleted_at", null);
    if (linkError) {
      logger.warn(
        {
          event: "sales.demo.crm.link_failed",
          companyId: input.companyId,
          bookingId: input.bookingId,
          message: linkError.message,
        },
        "Failed to link demo booking to lead",
      );
    }
  }

  try {
    const advanced = await advanceLeadToDemoScheduled(platform, ctx, {
      id: leadRow.id,
      lifecycleStatus: leadRow.lifecycle_status,
      pipelineId: leadRow.pipeline_id,
    });

    // Pause pressure: cancel pending follow-ups while demo is scheduled.
    await cancelSalesFollowUpAfterLeadStop(client, {
      companyId: input.companyId,
      leadId: leadRow.id,
      reason: "demo_scheduled",
    });

    return {
      ok: true,
      leadId: advanced.lead.id,
      bookingId: input.bookingId,
      lifecycleStatus: advanced.lead.lifecycleStatus,
      alreadyDemoScheduled: advanced.already,
    };
  } catch (error) {
    logger.warn(
      {
        event: "sales.demo.crm.stage_blocked",
        companyId: input.companyId,
        leadId: leadRow.id,
        bookingId: input.bookingId,
        from: leadRow.lifecycle_status,
        err: error instanceof Error ? error.message : String(error),
      },
      "Demo booking linked; lifecycle advance blocked",
    );
    return {
      ok: true,
      leadId: leadRow.id,
      bookingId: input.bookingId,
      lifecycleStatus: leadRow.lifecycle_status,
      linkedOnly: true,
      reason: "stage_transition_blocked",
    };
  }
}

async function loadSalesDemoBookingContext(
  client: SupabaseClient,
  companyId: string,
  bookingId: string,
): Promise<{
  bookingId: string;
  customerId: string;
  leadId: string | null;
  serviceKind: string;
} | null> {
  const productDemo = await client
    .from("product_demo_bookings")
    .select("id, customer_id, lead_id")
    .eq("id", bookingId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (productDemo.error) throw new Error(productDemo.error.message);
  if (productDemo.data) {
    return {
      bookingId: String(productDemo.data.id),
      customerId: productDemo.data.customer_id ? String(productDemo.data.customer_id) : "",
      leadId: productDemo.data.lead_id ? String(productDemo.data.lead_id) : null,
      serviceKind: "sales_demo",
    };
  }

  const { data: booking, error } = await client
    .from("scheduling_bookings")
    .select("id, customer_id, lead_id, service_id")
    .eq("id", bookingId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking) return null;

  const serviceId = booking.service_id ? String(booking.service_id) : "";
  let serviceKind = "operational";
  if (serviceId) {
    const { data: service, error: serviceError } = await client
      .from("scheduling_services")
      .select("service_kind")
      .eq("id", serviceId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (serviceError) throw new Error(serviceError.message);
    serviceKind = String(service?.service_kind ?? "operational");
  }

  return {
    bookingId: String(booking.id),
    customerId: String(booking.customer_id),
    leadId: booking.lead_id ? String(booking.lead_id) : null,
    serviceKind,
  };
}

/**
 * Sales-demo cancellation: if the lead is still demo_scheduled, move back to contacted
 * via changeLeadStage. Never treats cancel as demo completed. Does not revive cancelled
 * follow-up jobs (avoids stale reminders).
 */
export async function syncSalesDemoBookingCancelledToCrm(
  client: SupabaseClient,
  input: {
    companyId: string;
    userId: string;
    bookingId: string;
  },
  platformFactory: (c: SupabaseClient) => LeadPlatformServices = createLeadPlatformServices,
): Promise<SalesDemoCrmLifecycleResult> {
  const ctxBooking = await loadSalesDemoBookingContext(client, input.companyId, input.bookingId);
  if (!ctxBooking) {
    return {
      ok: false,
      leadId: null,
      bookingId: input.bookingId,
      lifecycleStatus: null,
      reason: "booking_not_found",
    };
  }
  if (ctxBooking.serviceKind !== "sales_demo") {
    return {
      ok: true,
      leadId: ctxBooking.leadId,
      bookingId: input.bookingId,
      lifecycleStatus: null,
      reason: "not_sales_demo",
    };
  }

  const platform = platformFactory(client);
  const ctx = buildCtx(input.userId, input.companyId);

  let leadId = ctxBooking.leadId;
  let lifecycleStatus: string | null = null;
  if (leadId) {
    const existing = await platform.queries.getLead(ctx, {
      companyId: input.companyId,
      leadId,
    });
    if (existing.lead && isOpenLeadLifecycle(existing.lead.lifecycleStatus)) {
      lifecycleStatus = existing.lead.lifecycleStatus;
    } else {
      leadId = null;
    }
  }
  if (!leadId) {
    const open =
      (await findOpenLeadForCustomer(client, input.companyId, ctxBooking.customerId)) ?? null;
    if (!open) {
      return {
        ok: true,
        leadId: null,
        bookingId: input.bookingId,
        lifecycleStatus: null,
        reason: "no_open_lead",
      };
    }
    leadId = open.id;
    lifecycleStatus = open.lifecycle_status;
  }

  if (lifecycleStatus !== "demo_scheduled") {
    return {
      ok: true,
      leadId,
      bookingId: input.bookingId,
      lifecycleStatus,
      reason: "lead_not_demo_scheduled",
    };
  }

  try {
    const existing = await platform.queries.getLead(ctx, {
      companyId: input.companyId,
      leadId,
    });
    if (!existing.lead) {
      return {
        ok: false,
        leadId,
        bookingId: input.bookingId,
        lifecycleStatus,
        reason: "lead_not_found",
      };
    }
    const next = await changeToLifecycle(
      platform,
      ctx,
      input.companyId,
      leadId,
      existing.lead.pipelineId,
      "contacted",
      { source: "system", reason: "demo_booking_cancelled" },
    );
    return {
      ok: true,
      leadId: next.id,
      bookingId: input.bookingId,
      lifecycleStatus: next.lifecycleStatus,
    };
  } catch (error) {
    logger.warn(
      {
        event: "sales.demo.crm.cancel_stage_blocked",
        companyId: input.companyId,
        leadId,
        bookingId: input.bookingId,
        err: error instanceof Error ? error.message : String(error),
      },
      "Demo cancel CRM revert blocked",
    );
    return {
      ok: true,
      leadId,
      bookingId: input.bookingId,
      lifecycleStatus,
      linkedOnly: true,
      reason: "stage_transition_blocked",
    };
  }
}

/**
 * Sales-demo reschedule: keep / restore demo_scheduled; re-pause follow-ups.
 * Never marks the demo completed.
 */
export async function syncSalesDemoBookingRescheduledToCrm(
  client: SupabaseClient,
  input: {
    companyId: string;
    userId: string;
    bookingId: string;
    conversationId?: string | null;
  },
  platformFactory: (c: SupabaseClient) => LeadPlatformServices = createLeadPlatformServices,
): Promise<SalesDemoCrmLifecycleResult> {
  const ctxBooking = await loadSalesDemoBookingContext(client, input.companyId, input.bookingId);
  if (!ctxBooking) {
    return {
      ok: false,
      leadId: null,
      bookingId: input.bookingId,
      lifecycleStatus: null,
      reason: "booking_not_found",
    };
  }
  if (ctxBooking.serviceKind !== "sales_demo") {
    return {
      ok: true,
      leadId: ctxBooking.leadId,
      bookingId: input.bookingId,
      lifecycleStatus: null,
      reason: "not_sales_demo",
    };
  }

  return syncSalesDemoBookingToCrm(
    client,
    {
      companyId: input.companyId,
      userId: input.userId,
      customerId: ctxBooking.customerId,
      bookingId: input.bookingId,
      conversationId: input.conversationId ?? null,
    },
    platformFactory,
  );
}
