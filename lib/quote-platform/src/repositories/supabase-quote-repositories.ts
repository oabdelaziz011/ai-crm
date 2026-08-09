import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  QuoteApprovalRecord,
  QuoteApprovalStatus,
  QuoteHistoryRecord,
  QuoteLineItemRecord,
  QuoteLineKind,
  QuoteRecord,
  QuoteStatus,
  QuoteTemplateRecord,
} from "../types.js";
import type {
  CreateQuoteInput,
  QuoteRepository,
  UpsertQuoteLineInput,
} from "./quote-repository-port.js";

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapQuote(row: Record<string, unknown>): QuoteRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    quoteFamilyId: String(row.quote_family_id),
    versionNumber: Number(row.version_number ?? 1),
    quoteNumber: String(row.quote_number),
    opportunityId: row.opportunity_id ? String(row.opportunity_id) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    templateId: row.template_id ? String(row.template_id) : null,
    status: String(row.status) as QuoteStatus,
    title: String(row.title ?? ""),
    contactName: String(row.contact_name ?? ""),
    currency: String(row.currency ?? "USD"),
    language: String(row.language ?? "en"),
    country: row.country != null ? String(row.country) : null,
    market: row.market != null ? String(row.market) : null,
    validUntil: row.valid_until != null ? String(row.valid_until) : null,
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    subtotal: Number(row.subtotal ?? 0),
    discountTotal: Number(row.discount_total ?? 0),
    taxTotal: Number(row.tax_total ?? 0),
    shippingTotal: Number(row.shipping_total ?? 0),
    grandTotal: Number(row.grand_total ?? 0),
    weightedRevenue: num(row.weighted_revenue),
    opportunityProbabilityPercent: num(row.opportunity_probability_percent),
    notes: String(row.notes ?? ""),
    isCurrent: Boolean(row.is_current),
    supersededByQuoteId: row.superseded_by_quote_id ? String(row.superseded_by_quote_id) : null,
    sentAt: row.sent_at != null ? String(row.sent_at) : null,
    viewedAt: row.viewed_at != null ? String(row.viewed_at) : null,
    acceptedAt: row.accepted_at != null ? String(row.accepted_at) : null,
    rejectedAt: row.rejected_at != null ? String(row.rejected_at) : null,
    expiredAt: row.expired_at != null ? String(row.expired_at) : null,
    convertedAt: row.converted_at != null ? String(row.converted_at) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapLine(row: Record<string, unknown>): QuoteLineItemRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    quoteId: String(row.quote_id),
    lineKind: String(row.line_kind) as QuoteLineKind,
    productId: row.product_id ? String(row.product_id) : null,
    productNameSnapshot: String(row.product_name_snapshot ?? ""),
    skuSnapshot: String(row.sku_snapshot ?? ""),
    sectionTitle: row.section_title != null ? String(row.section_title) : null,
    notes: String(row.notes ?? ""),
    isOptional: Boolean(row.is_optional),
    quantity: Number(row.quantity ?? 1),
    unitPrice: Number(row.unit_price ?? 0),
    discountPercent: Number(row.discount_percent ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    taxPercent: Number(row.tax_percent ?? 0),
    currency: String(row.currency ?? "USD"),
    subtotal: Number(row.subtotal ?? 0),
    taxAmount: Number(row.tax_amount ?? 0),
    total: Number(row.total ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapTemplate(row: Record<string, unknown>): QuoteTemplateRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name),
    slug: String(row.slug),
    description: String(row.description ?? ""),
    defaultLanguage: String(row.default_language ?? "en"),
    defaultCurrency: String(row.default_currency ?? "USD"),
    validityDays: Number(row.validity_days ?? 14),
    bodyJson: (row.body_json as Record<string, unknown>) ?? {},
    isActive: Boolean(row.is_active),
  };
}

function mapApproval(row: Record<string, unknown>): QuoteApprovalRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    quoteId: String(row.quote_id),
    status: String(row.status) as QuoteApprovalStatus,
    requestedBy: row.requested_by ? String(row.requested_by) : null,
    decidedBy: row.decided_by ? String(row.decided_by) : null,
    decisionNote: String(row.decision_note ?? ""),
    requestedAt: String(row.requested_at),
    decidedAt: row.decided_at != null ? String(row.decided_at) : null,
  };
}

function mapHistory(row: Record<string, unknown>): QuoteHistoryRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    quoteId: String(row.quote_id),
    eventType: String(row.event_type),
    fieldName: row.field_name != null ? String(row.field_name) : null,
    previousValue: row.previous_value != null ? String(row.previous_value) : null,
    newValue: row.new_value != null ? String(row.new_value) : null,
    summary: String(row.summary ?? ""),
    payload: (row.payload as Record<string, unknown>) ?? {},
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    createdAt: String(row.created_at),
  };
}

export function createSupabaseQuoteRepository(client: SupabaseClient): QuoteRepository {
  return {
    async ensureDefaultTemplates(companyId) {
      const { error } = await client.rpc("quote_platform_ensure_default_templates", {
        p_company_id: companyId,
      });
      if (error) throw error;
    },

    async listTemplates(companyId) {
      await this.ensureDefaultTemplates(companyId);
      const { data, error } = await client
        .from("quote_templates")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => mapTemplate(r as Record<string, unknown>));
    },

    async getTemplate(companyId, templateId) {
      const { data, error } = await client
        .from("quote_templates")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", templateId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapTemplate(data as Record<string, unknown>) : null;
    },

    async createQuote(input) {
      const { data, error } = await client
        .from("quotes")
        .insert({
          company_id: input.companyId,
          quote_family_id: input.quoteFamilyId,
          version_number: input.versionNumber,
          quote_number: input.quoteNumber,
          opportunity_id: input.opportunityId ?? null,
          customer_id: input.customerId ?? null,
          template_id: input.templateId ?? null,
          status: input.status ?? "draft",
          title: input.title ?? "",
          contact_name: input.contactName ?? "",
          currency: input.currency ?? "USD",
          language: input.language ?? "en",
          country: input.country ?? null,
          market: input.market ?? null,
          valid_until: input.validUntil ?? null,
          owner_user_id: input.ownerUserId ?? null,
          notes: input.notes ?? "",
          opportunity_probability_percent: input.opportunityProbabilityPercent ?? null,
          is_current: input.isCurrent ?? true,
          metadata: input.metadata ?? {},
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapQuote(data as Record<string, unknown>);
    },

    async updateQuote(input) {
      const patch: Record<string, unknown> = {
        updated_by: input.updatedBy,
        updated_at: new Date().toISOString(),
      };
      const fields: Array<[keyof typeof input, string]> = [
        ["status", "status"],
        ["title", "title"],
        ["contactName", "contact_name"],
        ["currency", "currency"],
        ["language", "language"],
        ["country", "country"],
        ["market", "market"],
        ["validUntil", "valid_until"],
        ["ownerUserId", "owner_user_id"],
        ["notes", "notes"],
        ["subtotal", "subtotal"],
        ["discountTotal", "discount_total"],
        ["taxTotal", "tax_total"],
        ["shippingTotal", "shipping_total"],
        ["grandTotal", "grand_total"],
        ["weightedRevenue", "weighted_revenue"],
        ["opportunityProbabilityPercent", "opportunity_probability_percent"],
        ["isCurrent", "is_current"],
        ["supersededByQuoteId", "superseded_by_quote_id"],
        ["sentAt", "sent_at"],
        ["viewedAt", "viewed_at"],
        ["acceptedAt", "accepted_at"],
        ["rejectedAt", "rejected_at"],
        ["expiredAt", "expired_at"],
        ["convertedAt", "converted_at"],
        ["metadata", "metadata"],
      ];
      for (const [key, col] of fields) {
        if (input[key] !== undefined) patch[col] = input[key];
      }

      const { data, error } = await client
        .from("quotes")
        .update(patch)
        .eq("company_id", input.companyId)
        .eq("id", input.quoteId)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw error;
      return mapQuote(data as Record<string, unknown>);
    },

    async softDeleteQuote(companyId, quoteId, updatedBy) {
      const { error } = await client
        .from("quotes")
        .update({
          deleted_at: new Date().toISOString(),
          is_current: false,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("id", quoteId);
      if (error) throw error;
    },

    async getQuote(companyId, quoteId) {
      const { data, error } = await client
        .from("quotes")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", quoteId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapQuote(data as Record<string, unknown>) : null;
    },

    async listQuotes(input) {
      let query = client
        .from("quotes")
        .select("*", { count: "exact" })
        .eq("company_id", input.companyId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);
      if (input.opportunityId) query = query.eq("opportunity_id", input.opportunityId);
      if (input.status) query = query.eq("status", input.status);
      if (input.currentOnly) query = query.eq("is_current", true);
      const { data, error, count } = await query;
      if (error) throw error;
      return {
        items: (data ?? []).map((r) => mapQuote(r as Record<string, unknown>)),
        total: count ?? 0,
      };
    },

    async listVersions(companyId, quoteFamilyId) {
      const { data, error } = await client
        .from("quotes")
        .select("*")
        .eq("company_id", companyId)
        .eq("quote_family_id", quoteFamilyId)
        .is("deleted_at", null)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => mapQuote(r as Record<string, unknown>));
    },

    async nextQuoteNumber(companyId) {
      const { count, error } = await client
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("version_number", 1);
      if (error) throw error;
      const seq = (count ?? 0) + 1;
      return `Q-${String(seq).padStart(5, "0")}`;
    },

    async listLines(companyId, quoteId) {
      const { data, error } = await client
        .from("quote_line_items")
        .select("*")
        .eq("company_id", companyId)
        .eq("quote_id", quoteId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => mapLine(r as Record<string, unknown>));
    },

    async upsertLine(input: UpsertQuoteLineInput) {
      const row = {
        company_id: input.companyId,
        quote_id: input.quoteId,
        line_kind: input.lineKind,
        product_id: input.productId ?? null,
        product_name_snapshot: input.productNameSnapshot,
        sku_snapshot: input.skuSnapshot ?? "",
        section_title: input.sectionTitle ?? null,
        notes: input.notes ?? "",
        is_optional: input.isOptional ?? false,
        quantity: input.quantity,
        unit_price: input.unitPrice,
        discount_percent: input.discountPercent,
        discount_amount: input.discountAmount,
        tax_percent: input.taxPercent,
        currency: input.currency,
        subtotal: input.subtotal,
        tax_amount: input.taxAmount,
        total: input.total,
        sort_order: input.sortOrder ?? 0,
        updated_by: input.actorUserId,
        updated_at: new Date().toISOString(),
      };
      if (input.id) {
        const { data, error } = await client
          .from("quote_line_items")
          .update(row)
          .eq("company_id", input.companyId)
          .eq("id", input.id)
          .is("deleted_at", null)
          .select("*")
          .single();
        if (error) throw error;
        return mapLine(data as Record<string, unknown>);
      }
      const { data, error } = await client
        .from("quote_line_items")
        .insert({ ...row, created_by: input.actorUserId })
        .select("*")
        .single();
      if (error) throw error;
      return mapLine(data as Record<string, unknown>);
    },

    async removeLine(companyId, lineId, actorUserId) {
      const { error } = await client
        .from("quote_line_items")
        .update({
          deleted_at: new Date().toISOString(),
          updated_by: actorUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("id", lineId);
      if (error) throw error;
    },

    async copyLines(input) {
      const lines = await this.listLines(input.companyId, input.fromQuoteId);
      const copied: QuoteLineItemRecord[] = [];
      for (const [index, line] of lines.entries()) {
        copied.push(
          await this.upsertLine({
            companyId: input.companyId,
            quoteId: input.toQuoteId,
            lineKind: line.lineKind,
            productId: line.productId,
            productNameSnapshot: line.productNameSnapshot,
            skuSnapshot: line.skuSnapshot,
            sectionTitle: line.sectionTitle,
            notes: line.notes,
            isOptional: line.isOptional,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent,
            discountAmount: line.discountAmount,
            taxPercent: line.taxPercent,
            currency: line.currency,
            subtotal: line.subtotal,
            taxAmount: line.taxAmount,
            total: line.total,
            sortOrder: index,
            actorUserId: input.actorUserId,
          }),
        );
      }
      return copied;
    },

    async createApproval(input) {
      const { data, error } = await client
        .from("quote_approvals")
        .insert({
          company_id: input.companyId,
          quote_id: input.quoteId,
          status: "pending",
          requested_by: input.requestedBy,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapApproval(data as Record<string, unknown>);
    },

    async decideApproval(input) {
      const { data, error } = await client
        .from("quote_approvals")
        .update({
          status: input.status,
          decided_by: input.decidedBy,
          decision_note: input.decisionNote ?? "",
          decided_at: new Date().toISOString(),
        })
        .eq("company_id", input.companyId)
        .eq("id", input.approvalId)
        .select("*")
        .single();
      if (error) throw error;
      return mapApproval(data as Record<string, unknown>);
    },

    async listApprovals(companyId, quoteId) {
      const { data, error } = await client
        .from("quote_approvals")
        .select("*")
        .eq("company_id", companyId)
        .eq("quote_id", quoteId)
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => mapApproval(r as Record<string, unknown>));
    },

    async addHistory(input) {
      const { data, error } = await client
        .from("quote_history")
        .insert({
          company_id: input.companyId,
          quote_id: input.quoteId,
          event_type: input.eventType,
          field_name: input.fieldName ?? null,
          previous_value: input.previousValue ?? null,
          new_value: input.newValue ?? null,
          summary: input.summary ?? "",
          payload: input.payload ?? {},
          actor_user_id: input.actorUserId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapHistory(data as Record<string, unknown>);
    },

    async listHistory(companyId, quoteId, limit = 100) {
      const { data, error } = await client
        .from("quote_history")
        .select("*")
        .eq("company_id", companyId)
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => mapHistory(r as Record<string, unknown>));
    },

    async setOpportunityCurrentQuote(input) {
      const { error } = await client
        .from("opportunities")
        .update({
          current_quote_id: input.quoteId,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", input.companyId)
        .eq("id", input.opportunityId);
      if (error) throw error;
    },

    async getOpportunitySnapshot(companyId, opportunityId) {
      const { data, error } = await client
        .from("opportunities")
        .select(
          "id, name, customer_id, company_name, primary_contact_name, owner_user_id, currency, country, market, language, probability_percent, expected_revenue",
        )
        .eq("company_id", companyId)
        .eq("id", opportunityId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: String(data.id),
        name: String(data.name),
        customerId: data.customer_id ? String(data.customer_id) : null,
        companyName: data.company_name != null ? String(data.company_name) : null,
        primaryContactName: String(data.primary_contact_name ?? ""),
        ownerUserId: data.owner_user_id ? String(data.owner_user_id) : null,
        currency: String(data.currency ?? "USD"),
        country: data.country != null ? String(data.country) : null,
        market: data.market != null ? String(data.market) : null,
        language: data.language != null ? String(data.language) : null,
        probabilityPercent: Number(data.probability_percent ?? 0),
        expectedRevenue: num(data.expected_revenue),
      };
    },

    async listOpportunityLines(companyId, opportunityId) {
      const { data, error } = await client
        .from("opportunity_line_items")
        .select(
          "product_id, product_name_snapshot, sku_snapshot, quantity, unit_price, discount_percent, tax_percent, currency",
        )
        .eq("company_id", companyId)
        .eq("opportunity_id", opportunityId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        productId: String(row.product_id),
        productNameSnapshot: String(row.product_name_snapshot),
        skuSnapshot: String(row.sku_snapshot ?? ""),
        quantity: Number(row.quantity ?? 1),
        unitPrice: Number(row.unit_price ?? 0),
        discountPercent: Number(row.discount_percent ?? 0),
        taxPercent: Number(row.tax_percent ?? 0),
        currency: String(row.currency ?? "USD"),
      }));
    },

    async getCatalogProduct(companyId, productId) {
      const { data, error } = await client
        .from("catalog_products")
        .select("id, name, sku, product_type, base_price, currency, subscription_price, is_active")
        .eq("company_id", companyId)
        .eq("id", productId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: String(data.id),
        name: String(data.name),
        sku: String(data.sku),
        productType: String(data.product_type),
        basePrice: Number(data.base_price ?? 0),
        currency: String(data.currency ?? "USD"),
        subscriptionPrice: num(data.subscription_price),
        isActive: Boolean(data.is_active),
      };
    },

    async listRegionalPrices(companyId, productId) {
      const { data, error } = await client
        .from("product_regional_prices")
        .select("country, market, region, local_price, currency_override, is_active")
        .eq("company_id", companyId)
        .eq("product_id", productId)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        country: row.country != null ? String(row.country) : null,
        market: row.market != null ? String(row.market) : null,
        region: row.region != null ? String(row.region) : null,
        localPrice: Number(row.local_price ?? 0),
        currencyOverride: row.currency_override != null ? String(row.currency_override) : null,
        isActive: Boolean(row.is_active),
      }));
    },
  };
}
