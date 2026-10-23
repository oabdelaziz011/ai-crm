import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadRecord } from "@workspace/lead-platform";
import { createLoginAppLeadPlatformServices } from "@/lib/lead-platform/lead-platform-factory";

const CLOSED = new Set(["converted", "archived", "lost", "unqualified"]);

function currencyFromTexts(texts: readonly string[]): string | undefined {
  const corpus = texts.join("\n");
  if (/\bEGP\b|جنيه/i.test(corpus)) return "EGP";
  if (/\bUSD\b|دولار/i.test(corpus)) return "USD";
  if (/\bEUR\b|يورو/i.test(corpus)) return "EUR";
  return undefined;
}

function phonesConflict(existing: string | null | undefined, incoming: string | null | undefined): boolean {
  const left = String(existing ?? "").replace(/\D/g, "");
  const right = String(incoming ?? "").replace(/\D/g, "");
  if (!left || !right) return false;
  const size = Math.min(left.length, right.length);
  if (size < 9) return left !== right;
  return left.slice(-9) !== right.slice(-9);
}

async function readConversationLeadId(
  client: SupabaseClient,
  companyId: string,
  conversationId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("conversations")
    .select("lead_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.lead_id ? String(data.lead_id) : null;
}

async function linkConversationLead(
  client: SupabaseClient,
  companyId: string,
  conversationId: string,
  leadId: string,
): Promise<string> {
  if (!leadId.trim()) {
    return (await readConversationLeadId(client, companyId, conversationId)) ?? "";
  }
  const current = await readConversationLeadId(client, companyId, conversationId);
  if (current) return current;

  const { data: updated, error: updateError } = await client
    .from("conversations")
    .update({ lead_id: leadId })
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .is("lead_id", null)
    .select("lead_id")
    .maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (updated?.lead_id) return String(updated.lead_id);

  const { data: winner, error: winnerError } = await client
    .from("conversations")
    .select("lead_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (winnerError) throw new Error(winnerError.message);
  return winner?.lead_id ? String(winner.lead_id) : leadId;
}

function reusable(lead: LeadRecord | null | undefined): lead is LeadRecord {
  return Boolean(lead && !CLOSED.has(lead.lifecycleStatus));
}

export async function ensurePurchaseLeadForConversation(
  client: SupabaseClient,
  input: {
    companyId: string;
    userId: string;
    isSuperAdmin: boolean;
    hasPermission: (code: string) => boolean;
    conversationId: string;
    customerId: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    texts: readonly string[];
  },
): Promise<{ leadId: string; created: boolean }> {
  const platform = createLoginAppLeadPlatformServices(client);
  const ctx = {
    userId: input.userId,
    companyId: input.companyId,
    isSuperAdmin: input.isSuperAdmin,
    hasPermission: input.hasPermission,
  };

  const linkedId = await linkConversationLead(client, input.companyId, input.conversationId, "");
  if (linkedId) {
    const { lead } = await platform.queries.getLead(ctx, {
      companyId: input.companyId,
      leadId: linkedId,
    });
    if (reusable(lead)) return { leadId: lead.id, created: false };
  }

  const byConversation = await platform.queries.getLeadByConversation(ctx, {
    companyId: input.companyId,
    conversationId: input.conversationId,
  });
  if (reusable(byConversation.lead)) {
    const leadId = await linkConversationLead(
      client,
      input.companyId,
      input.conversationId,
      byConversation.lead.id,
    );
    return { leadId, created: false };
  }

  const { data: customerLeads, error: customerLeadError } = await client
    .from("leads")
    .select("id, lifecycle_status, phone")
    .eq("company_id", input.companyId)
    .eq("customer_id", input.customerId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (customerLeadError) throw new Error(customerLeadError.message);
  const openCustomerLead = (customerLeads ?? []).find(
    (row) => !CLOSED.has(String(row.lifecycle_status ?? "")),
  );
  if (openCustomerLead?.id) {
    if (!phonesConflict(openCustomerLead.phone, input.phone) && input.phone && !openCustomerLead.phone) {
      await platform.commands.updateLead(ctx, {
        companyId: input.companyId,
        leadId: String(openCustomerLead.id),
        phone: input.phone,
      });
    }
    const leadId = await linkConversationLead(
      client,
      input.companyId,
      input.conversationId,
      String(openCustomerLead.id),
    );
    return { leadId, created: false };
  }

  const created = await platform.commands.createLead(ctx, {
    companyId: input.companyId,
    title: input.name.trim() || "Purchase",
    contactName: input.name.trim() || undefined,
    email: input.email ?? undefined,
    phone: input.phone ?? undefined,
    customerId: input.customerId,
    conversationId: input.conversationId,
    currency: currencyFromTexts(input.texts),
  });
  const leadId = await linkConversationLead(
    client,
    input.companyId,
    input.conversationId,
    created.lead.id,
  );
  return { leadId, created: leadId === created.lead.id };
}
