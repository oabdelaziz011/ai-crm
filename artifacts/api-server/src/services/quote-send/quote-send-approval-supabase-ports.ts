import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteSendApprovalPorts } from "./quote-send-approval-service.js";

export function createQuoteSendApprovalSupabasePorts(
  client: SupabaseClient,
): QuoteSendApprovalPorts {
  return {
    async listPendingSendRequests(companyId) {
      const { data, error } = await client
        .from("quotes")
        .select("id, quote_number, status, title, contact_name, grand_total, currency, metadata")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .contains("metadata", { aiSendRequest: { status: "pending_human_approval" } })
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        quoteId: String(row.id),
        quoteNumber: String(row.quote_number ?? ""),
        status: String(row.status ?? ""),
        title: String(row.title ?? ""),
        contactName: typeof row.contact_name === "string" ? row.contact_name : "",
        grandTotal: Number(row.grand_total ?? 0),
        currency: String(row.currency ?? ""),
        metadata: (row.metadata as Record<string, unknown>) ?? {},
      }));
    },

    async loadQuoteMetadata(companyId, quoteId) {
      const { data, error } = await client
        .from("quotes")
        .select("metadata, status, quote_number")
        .eq("company_id", companyId)
        .eq("id", quoteId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        metadata: (data.metadata as Record<string, unknown>) ?? {},
        status: String(data.status ?? ""),
        quoteNumber: String(data.quote_number ?? ""),
      };
    },

    async writeQuoteMetadata({ companyId, quoteId, actorUserId, metadata }) {
      const { error } = await client
        .from("quotes")
        .update({
          metadata,
          updated_by: actorUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("id", quoteId)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
    },

    async claimPendingSendRequest({ companyId, quoteId, actorUserId, metadata }) {
      const { data, error } = await client
        .from("quotes")
        .update({
          metadata,
          updated_by: actorUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("id", quoteId)
        .is("deleted_at", null)
        .contains("metadata", { aiSendRequest: { status: "pending_human_approval" } })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data?.id);
    },

    async reclaimStaleSendingRequest({ companyId, quoteId, actorUserId, metadata, staleBefore }) {
      const { data, error } = await client
        .from("quotes")
        .update({
          metadata,
          updated_by: actorUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("id", quoteId)
        .is("deleted_at", null)
        .contains("metadata", { aiSendRequest: { status: "sending" } })
        .lt("updated_at", staleBefore.toISOString())
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data?.id);
    },
  };
}
