/**
 * Promote leads.metadata.productInterest into an Opportunity after qualification.
 * Demo-led journeys skip automatic creation until an explicit human convert.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseOpportunityRepository } from "../repositories/supabase-opportunity-repositories.js";
import { isDemoLedLead } from "./demo-led-lead.js";
import { OpportunityValidationError } from "../errors.js";
import {
  OpportunityCommandService,
  type OpportunityEventPublisherPort,
} from "./opportunity-command-service.js";
import { decideProductInterestOpportunity } from "./opportunity-product-interest.js";

const noopEvents: OpportunityEventPublisherPort = {
  async publishCreated() {},
  async publishStageChanged() {},
  async publishProbabilityChanged() {},
  async publishWon() {},
  async publishLost() {},
  async publishNegotiationStarted() {},
};

/** True when Postgres rejected an insert due to a unique index (incl. concurrency races). */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "23505") return true;
  return /duplicate key|unique constraint|opportunities_one_open|opportunity_line_items_one_product/i.test(
    String(e.message ?? ""),
  );
}

async function resolveCompanyActorUserId(
  client: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const { data } = await client
    .from("profiles")
    .select("user_id")
    .eq("company_id", companyId)
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();
  return data?.user_id ? String(data.user_id) : null;
}

async function attachLineItemIfMissing(
  client: SupabaseClient,
  input: {
    companyId: string;
    opportunityId: string;
    productId: string;
    productName: string;
  },
): Promise<void> {
  const { data: existingLine } = await client
    .from("opportunity_line_items")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("opportunity_id", input.opportunityId)
    .eq("product_id", input.productId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingLine) return;
  const { error } = await client.from("opportunity_line_items").insert({
    company_id: input.companyId,
    opportunity_id: input.opportunityId,
    product_id: input.productId,
    product_name_snapshot: input.productName,
    quantity: 1,
    unit_price: 0,
    currency: "USD",
  });
  // Concurrent attach after opportunity create: unique index
  // opportunity_line_items_one_product_per_opp_idx — treat as already attached.
  if (error && !isUniqueViolation(error)) throw new Error(error.message);
}

export async function applyStoredProductInterestAfterQualify(
  client: SupabaseClient,
  input: { companyId: string; leadId: string },
): Promise<{ applied: boolean; reason: string }> {
  const { data: lead, error } = await client
    .from("leads")
    .select("id, metadata, customer_id, is_qualified, title, contact_name, lifecycle_status")
    .eq("id", input.leadId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) return { applied: false, reason: "lead_missing" };
  // Only promote after authoritative qualification succeeded (is_qualified already persisted).
  if (lead.is_qualified !== true) {
    return { applied: false, reason: "lead_not_qualified" };
  }

  const metadata =
    lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
      ? (lead.metadata as Record<string, unknown>)
      : {};
  const interest =
    metadata.productInterest && typeof metadata.productInterest === "object"
      ? (metadata.productInterest as Record<string, unknown>)
      : null;
  const productId = typeof interest?.productId === "string" ? interest.productId.trim() : "";
  if (!productId) return { applied: false, reason: "no_stored_interest" };

  // Demo-led: preserve productInterest metadata but never auto-create an Opportunity.
  if (
    await isDemoLedLead(client, {
      companyId: input.companyId,
      leadId: input.leadId,
      lifecycleStatus: lead.lifecycle_status != null ? String(lead.lifecycle_status) : null,
    })
  ) {
    return { applied: false, reason: "demo_led_awaits_human_convert" };
  }

  const { data: product, error: productError } = await client
    .from("catalog_products")
    .select("id, company_id, name")
    .eq("id", productId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (productError) throw new Error(productError.message);
  if (!product) return { applied: false, reason: "product_not_in_company" };

  const decision = decideProductInterestOpportunity({
    companyId: input.companyId,
    leadId: input.leadId,
    customerId: lead.customer_id ? String(lead.customer_id) : null,
    catalogProductId: String(product.id),
    productName: typeof interest?.productName === "string" ? interest.productName : product.name,
    matchCount: 1,
    productCompanyId: String(product.company_id),
  });
  if (decision.action !== "reuse_or_create") {
    return { applied: false, reason: decision.reason };
  }

  const productName =
    (typeof interest?.productName === "string" && interest.productName.trim()) ||
    (typeof product.name === "string" ? product.name : "Product");

  const repos = createSupabaseOpportunityRepository(client);
  const customerId = lead.customer_id ? String(lead.customer_id) : null;

  // Prefer approved uniqueness key when customer + product are known.
  if (customerId) {
    const byScope = await repos.findOpenByCustomerProduct({
      companyId: input.companyId,
      customerId,
      primaryProductId: decision.catalogProductId,
    });
    if (byScope) {
      await attachLineItemIfMissing(client, {
        companyId: input.companyId,
        opportunityId: byScope.id,
        productId: decision.catalogProductId,
        productName,
      });
      return { applied: true, reason: "attached_to_open_opportunity" };
    }
  }

  // Fallback: open opp on same lead that already scopes this product (or has no primary yet).
  const { data: opportunities } = await client
    .from("opportunities")
    .select("id, won_at, lost_at, primary_product_id, customer_id")
    .eq("company_id", input.companyId)
    .eq("lead_id", input.leadId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(5);
  const openSameProduct = (opportunities ?? []).find(
    (row) =>
      !row.won_at &&
      !row.lost_at &&
      row.primary_product_id &&
      String(row.primary_product_id) === decision.catalogProductId,
  );
  if (openSameProduct?.id) {
    await attachLineItemIfMissing(client, {
      companyId: input.companyId,
      opportunityId: String(openSameProduct.id),
      productId: decision.catalogProductId,
      productName,
    });
    return { applied: true, reason: "attached_to_open_opportunity" };
  }

  const actorUserId = await resolveCompanyActorUserId(client, input.companyId);
  if (!actorUserId) return { applied: false, reason: "no_company_actor" };

  const commands = new OpportunityCommandService({
    opportunities: repos,
    events: noopEvents,
  });

  try {
    const { opportunity } = await commands.createFromLead(
      {
        userId: actorUserId,
        companyId: input.companyId,
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      {
        companyId: input.companyId,
        leadId: input.leadId,
        name: productName,
        primaryContactName:
          typeof lead.contact_name === "string" && lead.contact_name.trim()
            ? lead.contact_name.trim()
            : undefined,
        primaryProductId: decision.catalogProductId,
        // Skip soft lead-only reuse so concurrent applies hit the customer+product unique index.
        forceCreate: true,
        metadata: {
          source: "product_interest_after_qualify",
          productInterest: interest,
        },
      },
    );

    await attachLineItemIfMissing(client, {
      companyId: input.companyId,
      opportunityId: opportunity.id,
      productId: decision.catalogProductId,
      productName,
    });

    return { applied: true, reason: "opportunity_created_from_interest" };
  } catch (error) {
    // Do not write half-scoped opportunities when customer identity cannot be resolved.
    // Duck-type across package boundaries (instanceof can fail on duplicate module copies).
    const validationReason =
      error && typeof error === "object" && "reason" in error
        ? String((error as { reason?: unknown }).reason ?? "")
        : "";
    if (
      (error instanceof OpportunityValidationError ||
        (error && typeof error === "object" && (error as { code?: string }).code === "OPPORTUNITY_VALIDATION")) &&
      (validationReason === "customer_identity_required" ||
        validationReason === "customer_email_ambiguous" ||
        validationReason === "customer_not_in_company")
    ) {
      return { applied: false, reason: validationReason };
    }
    if (!isUniqueViolation(error)) throw error;
    if (customerId) {
      const winner = await repos.findOpenByCustomerProduct({
        companyId: input.companyId,
        customerId,
        primaryProductId: decision.catalogProductId,
      });
      if (winner) {
        await attachLineItemIfMissing(client, {
          companyId: input.companyId,
          opportunityId: winner.id,
          productId: decision.catalogProductId,
          productName,
        });
        return { applied: true, reason: "attached_to_open_opportunity" };
      }
    }
    const { data: afterRace } = await client
      .from("opportunities")
      .select("id, won_at, lost_at, primary_product_id")
      .eq("company_id", input.companyId)
      .eq("lead_id", input.leadId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    const winner = (afterRace ?? []).find(
      (row) =>
        !row.won_at &&
        !row.lost_at &&
        (!row.primary_product_id || String(row.primary_product_id) === decision.catalogProductId),
    );
    if (!winner?.id) throw error;
    await attachLineItemIfMissing(client, {
      companyId: input.companyId,
      opportunityId: String(winner.id),
      productId: decision.catalogProductId,
      productName,
    });
    return { applied: true, reason: "attached_to_open_opportunity" };
  }
}
