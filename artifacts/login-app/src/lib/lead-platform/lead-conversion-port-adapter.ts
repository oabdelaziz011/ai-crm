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
      const customerName =
        (input.contactName || "").trim() ||
        (input.companyName || "").trim() ||
        "Customer";

      const { customer } = await customerService.resolveCustomerForLeadConversion({
        companyId: input.companyId,
        userId: ownerUserId,
        name: customerName,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        notes,
      });

      if (input.preservedPayload.conversationId && typeof input.preservedPayload.conversationId === "string") {
        await client
          .from("conversations")
          .update({
            customer_id: customer.id,
            lead_id: input.leadId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.preservedPayload.conversationId)
          .eq("company_id", input.companyId);
      }

      await client
        .from("leads")
        .update({ customer_id: customer.id, is_qualified: true })
        .eq("id", input.leadId)
        .eq("company_id", input.companyId);

      // Convert = customer only. Opportunity creation is a separate explicit action
      // (Create Opportunity) so convert stays fast and never fails on pipeline/currency.
      return { customerId: customer.id, opportunityId: null };
    },
  };
}
