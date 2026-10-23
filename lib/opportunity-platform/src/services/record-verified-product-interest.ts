/**
 * Persist verified single-product interest onto the conversation lead.
 * Opportunity creation stays on applyStoredProductInterestAfterQualify.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideProductInterestOpportunity } from "./opportunity-product-interest.js";

export async function recordVerifiedProductInterestForConversation(
  client: SupabaseClient,
  input: {
    companyId: string;
    conversationId?: string | null;
    productId: string;
    productName: string | null;
    /** Audit source label; defaults to unambiguous search match. */
    source?: string;
  },
): Promise<{ linked: boolean; reason: string }> {
  const conversationId = input.conversationId?.trim() || null;
  if (!conversationId) return { linked: false, reason: "no_conversation" };

  const { data: conv, error: convError } = await client
    .from("conversations")
    .select("id, lead_id, customer_id, company_id")
    .eq("id", conversationId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (convError) throw new Error(convError.message);
  if (!conv) return { linked: false, reason: "conversation_not_found" };

  const leadId = conv.lead_id ? String(conv.lead_id) : null;
  if (!leadId) return { linked: false, reason: "no_lead" };

  const { data: product, error: productError } = await client
    .from("catalog_products")
    .select("id, company_id, name")
    .eq("id", input.productId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (productError) throw new Error(productError.message);
  if (!product) return { linked: false, reason: "product_not_in_company" };

  const decision = decideProductInterestOpportunity({
    companyId: input.companyId,
    leadId,
    customerId: conv.customer_id ? String(conv.customer_id) : null,
    catalogProductId: String(product.id),
    productName: input.productName ?? (typeof product.name === "string" ? product.name : null),
    matchCount: 1,
    productCompanyId: String(product.company_id),
  });
  if (decision.action !== "reuse_or_create") {
    return { linked: false, reason: decision.reason };
  }

  const { data: lead, error: leadError } = await client
    .from("leads")
    .select("id, metadata, customer_id, is_qualified, lifecycle_status")
    .eq("id", leadId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead) return { linked: false, reason: "lead_missing" };

  const metadata =
    lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
      ? ({ ...(lead.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const existingInterest =
    metadata.productInterest && typeof metadata.productInterest === "object"
      ? (metadata.productInterest as Record<string, unknown>)
      : null;
  if (existingInterest?.productId === decision.catalogProductId) {
    return { linked: true, reason: "already_recorded" };
  }

  metadata.productInterest = {
    productId: decision.catalogProductId,
    productName: input.productName ?? product.name ?? null,
    source:
      typeof input.source === "string" && input.source.trim()
        ? input.source.trim()
        : "search_products_unambiguous_match",
    at: new Date().toISOString(),
  };
  metadata.productName =
    typeof input.productName === "string" && input.productName.trim()
      ? input.productName.trim()
      : typeof product.name === "string"
        ? product.name
        : metadata.productName;

  const { error: updateError } = await client
    .from("leads")
    .update({
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("company_id", input.companyId);
  if (updateError) throw new Error(updateError.message);

  const { data: opportunities } = await client
    .from("opportunities")
    .select("id, won_at, lost_at")
    .eq("company_id", input.companyId)
    .eq("lead_id", leadId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(5);
  const open = (opportunities ?? []).find((row) => !row.won_at && !row.lost_at);
  if (open?.id) {
    const { data: existingLine } = await client
      .from("opportunity_line_items")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("opportunity_id", open.id)
      .eq("product_id", decision.catalogProductId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existingLine) {
      const productName =
        (typeof input.productName === "string" && input.productName.trim()) ||
        (typeof product.name === "string" ? product.name : "Product");
      await client.from("opportunity_line_items").insert({
        company_id: input.companyId,
        opportunity_id: open.id,
        product_id: decision.catalogProductId,
        product_name_snapshot: productName,
        quantity: 1,
        unit_price: 0,
        currency: "USD",
      });
    }
  }

  return { linked: true, reason: open?.id ? "lead_and_opportunity_updated" : "lead_interest_recorded" };
}
