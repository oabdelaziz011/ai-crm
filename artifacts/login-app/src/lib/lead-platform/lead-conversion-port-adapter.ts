import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseCustomerServicePort,
  resolveCompanyActorUserId,
} from "@workspace/automation-platform";
import type { LeadConversionPort } from "@workspace/lead-platform";

function formatPreservedNotes(payload: Record<string, unknown>): string {
  const sections: string[] = [];
  const tags = Array.isArray(payload.tags) ? payload.tags.filter((tag) => typeof tag === "string") : [];
  if (tags.length) sections.push(`Lead tags: ${tags.join(", ")}`);

  const notes = Array.isArray(payload.notes)
    ? payload.notes
        .filter((note) => note && typeof note === "object" && "body" in note)
        .map((note) => String((note as { body: unknown }).body))
    : [];
  if (notes.length) sections.push(`Lead notes:\n${notes.join("\n")}`);

  const aiSummary = typeof payload.aiSummary === "string" ? payload.aiSummary.trim() : "";
  if (aiSummary) sections.push(`AI summary:\n${aiSummary}`);

  const score = typeof payload.score === "number" ? payload.score : null;
  if (score != null) sections.push(`Lead score: ${score}`);

  return sections.join("\n\n");
}

export function createLoginAppLeadConversionPort(client: SupabaseClient): LeadConversionPort {
  const customerService = createSupabaseCustomerServicePort(client, {
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
  });

  return {
    async convertLead(input) {
      const ownerUserId =
        input.actorUserId ?? (await resolveCompanyActorUserId(client, input.companyId));
      if (!ownerUserId) {
        throw new Error("Cannot convert lead: no company user found for customer ownership.");
      }

      const preservedNotes = formatPreservedNotes(input.preservedPayload);
      const companyLine = input.companyName ? `Company: ${input.companyName}` : "";
      const notes = [companyLine, preservedNotes].filter(Boolean).join("\n\n");

      const created = await customerService.createCustomer({
        companyId: input.companyId,
        userId: ownerUserId,
        name: input.contactName,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        notes,
      });

      if (input.preservedPayload.conversationId && typeof input.preservedPayload.conversationId === "string") {
        await client
          .from("conversations")
          .update({
            customer_id: created.customer.id,
            lead_id: input.leadId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.preservedPayload.conversationId)
          .eq("company_id", input.companyId);
      }

      // Sprint 4.0 — create Opportunity from converted lead (no conversation duplication).
      let opportunityId: string | null = null;
      try {
        const { createLoginAppOpportunityPlatformServices } = await import(
          "@/lib/opportunity-platform/opportunity-platform-factory.js"
        );
        const opportunityPlatform = createLoginAppOpportunityPlatformServices(client);
        const ctx = {
          userId: ownerUserId,
          companyId: input.companyId,
          isSuperAdmin: true,
          hasPermission: () => true,
        };
        await client
          .from("leads")
          .update({ customer_id: created.customer.id, is_qualified: true })
          .eq("id", input.leadId)
          .eq("company_id", input.companyId);
        const { opportunity } = await opportunityPlatform.commands.createFromLead(ctx, {
          companyId: input.companyId,
          leadId: input.leadId,
        });
        opportunityId = opportunity.id;
      } catch {
        opportunityId = null;
      }

      return { customerId: created.customer.id, opportunityId };
    },
  };
}
