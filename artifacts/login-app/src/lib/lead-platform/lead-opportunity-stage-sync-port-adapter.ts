import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadOpportunityStageSyncPort } from "@workspace/lead-platform";
import {
  createSupabaseOpportunityRepository,
  createSupabaseOpportunitySaleCompletion,
  OPPORTUNITY_PERMISSIONS,
  OPPORTUNITY_VISIBLE_LEAD_LIFECYCLES,
  syncOpportunityStageFromLeadLifecycle,
} from "@workspace/opportunity-platform";
import { getCompanyCurrency } from "@/lib/company-locale/runtime";
import { createLoginAppOpportunityPlatformServices } from "@/lib/opportunity-platform/opportunity-platform-factory";

const VISIBLE_LEAD_LIFECYCLES = new Set<string>(OPPORTUNITY_VISIBLE_LEAD_LIFECYCLES);

function cleanLeadText(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function opportunityNameFromLead(lead: {
  companyName: string | null;
  title: string;
  contactName: string;
}): string {
  return (
    [cleanLeadText(lead.companyName), cleanLeadText(lead.title) || cleanLeadText(lead.contactName)]
      .filter(Boolean)
      .join(" — ") || "فرصة"
  );
}

function isUnreadableOpportunityName(name: string | null | undefined): boolean {
  const text = (name ?? "").trim().toLowerCase();
  return !text || text === "undefined" || text === "null" || text.includes("undefined");
}

/**
 * Bridges Lead Kanban / changeLeadStage into the Opportunity module.
 * Reaching the فرصة column (demo_completed) or later creates the linked opportunity
 * when one does not exist yet. Customer rows are not created here.
 * No external provider sends.
 */
export function createLoginAppLeadOpportunityStageSyncPort(
  client: SupabaseClient,
): LeadOpportunityStageSyncPort {
  const opportunities = createSupabaseOpportunityRepository(client);

  const serviceContext = (input: { companyId: string; actorUserId: string | null }) => ({
    userId: input.actorUserId,
    companyId: input.companyId,
    isSuperAdmin: true,
    hasPermission: (code: string) =>
      code === OPPORTUNITY_PERMISSIONS.edit ||
      code === OPPORTUNITY_PERMISSIONS.view ||
      code === OPPORTUNITY_PERMISSIONS.convert ||
      code === OPPORTUNITY_PERMISSIONS.create,
  });

  return {
    async onLeadLifecycleChanged(input) {
      const lifecycle = input.toLifecycleStatus.trim().toLowerCase();
      if (VISIBLE_LEAD_LIFECYCLES.has(lifecycle)) {
        try {
          await ensureOpportunityForKanbanColumn(client, opportunities, {
            ...input,
            lifecycle,
          });
        } catch (error) {
          console.warn("[lead-opportunity-create]", {
            companyId: input.companyId,
            leadId: input.leadId,
            err: error instanceof Error ? { message: error.message, name: error.name } : error,
          });
        }
      }

      return syncOpportunityStageFromLeadLifecycle(
        { opportunities, saleCompletion: createSupabaseOpportunitySaleCompletion(client) },
        serviceContext(input),
        {
          companyId: input.companyId,
          leadId: input.leadId,
          toLifecycleStatus: input.toLifecycleStatus,
        },
      );
    },
  };
}

async function ensureOpportunityForKanbanColumn(
  client: SupabaseClient,
  opportunities: ReturnType<typeof createSupabaseOpportunityRepository>,
  input: {
    companyId: string;
    leadId: string;
    actorUserId: string | null;
    lifecycle: string;
  },
) {
  const listed = await opportunities.listOpportunities({
    companyId: input.companyId,
    leadId: input.leadId,
    limit: 5,
    offset: 0,
    applyDemoVisibilityGate: false,
  });
  const lead = await opportunities.getLeadSnapshot(input.companyId, input.leadId);
  if (!lead) return;

  const open = listed.items.find((item) => !item.wonAt && !item.lostAt) ?? null;
  const name = opportunityNameFromLead(lead);
  if (!open) {
    await createLoginAppOpportunityPlatformServices(client).commands.createManual(
      {
        userId: input.actorUserId,
        companyId: input.companyId,
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      {
        companyId: input.companyId,
        name,
        leadId: input.leadId,
        customerId: lead.customerId ?? undefined,
        companyName: cleanLeadText(lead.companyName) || undefined,
        primaryContactName: cleanLeadText(lead.contactName) || undefined,
        ownerUserId: lead.assignedUserId ?? input.actorUserId ?? undefined,
        expectedRevenue: lead.estimatedValue ?? undefined,
        currency: lead.currency || undefined,
        companyDefaultCurrency: getCompanyCurrency() || undefined,
        expectedCloseDate: lead.expectedCloseDate,
        metadata: { createdFrom: "lead_kanban_opportunity_column" },
      },
    );
    return;
  }

  if (input.lifecycle === "converted" && lead.customerId && open.customerId !== lead.customerId) {
    await opportunities.updateOpportunity({
      companyId: input.companyId,
      opportunityId: open.id,
      updatedBy: input.actorUserId,
      customerId: lead.customerId,
    });
  }
}

/** Create missing opportunity rows for leads already sitting in فرصة or later. */
export async function reconcileOpportunitiesForVisibleLeads(
  client: SupabaseClient,
  input: { companyId: string; actorUserId: string | null },
): Promise<{ created: number; repaired: number }> {
  const opportunities = createSupabaseOpportunityRepository(client);
  const { data: leads, error } = await client
    .from("leads")
    .select("id, lifecycle_status")
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .in("lifecycle_status", [...VISIBLE_LEAD_LIFECYCLES]);
  if (error) throw error;

  const leadRows = (leads ?? [])
    .map((row) => ({
      id: row.id ? String(row.id) : "",
      lifecycle: row.lifecycle_status ? String(row.lifecycle_status) : "",
    }))
    .filter((row) => row.id);
  if (!leadRows.length) return { created: 0, repaired: 0 };

  const linked = new Set<string>();
  for (let index = 0; index < leadRows.length; index += 80) {
    const chunk = leadRows.slice(index, index + 80).map((row) => row.id);
    const { data: existing, error: existingError } = await client
      .from("opportunities")
      .select("id, name, lead_id")
      .eq("company_id", input.companyId)
      .is("deleted_at", null)
      .in("lead_id", chunk);
    if (existingError) throw existingError;
    for (const row of existing ?? []) {
      if (row.lead_id) linked.add(String(row.lead_id));
      if (!row.id || !row.lead_id || !isUnreadableOpportunityName(row.name ? String(row.name) : "")) continue;
      const lead = await opportunities.getLeadSnapshot(input.companyId, String(row.lead_id));
      if (!lead) continue;
      await opportunities.updateOpportunity({
        companyId: input.companyId,
        opportunityId: String(row.id),
        updatedBy: input.actorUserId,
        name: opportunityNameFromLead(lead),
        companyName: cleanLeadText(lead.companyName) || null,
        primaryContactName: cleanLeadText(lead.contactName),
      });
      repaired += 1;
    }
  }

  let created = 0;
  let repaired = 0;
  for (const lead of leadRows) {
    if (linked.has(lead.id)) continue;
    try {
      await ensureOpportunityForKanbanColumn(client, opportunities, {
        companyId: input.companyId,
        leadId: lead.id,
        actorUserId: input.actorUserId,
        lifecycle: lead.lifecycle,
      });
      created += 1;
    } catch (createError) {
      console.warn("[lead-opportunity-create]", {
        companyId: input.companyId,
        leadId: lead.id,
        err: createError instanceof Error ? createError.message : createError,
      });
    }
  }
  return { created, repaired };
}
