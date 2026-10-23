/**
 * Shared AI quote ports — quote-platform draft create + human send-request queue.
 * Never autonomous send, approve, convert, or payment.
 * Hosts inject price visibility; this module does not read browser or server secrets.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEffectivePrice } from "@workspace/product-platform";
import {
  QUOTE_PERMISSIONS,
  createNoopQuoteEventPublisher,
  createQuotePlatformServices,
  type QuoteServiceContext,
} from "@workspace/quote-platform";
import type { QuoteAgentToolPorts } from "../tools/quote-agent-ports.js";
import type { QuoteDeliveryCommandDeps } from "../tools/quote-send-request.js";
import {
  createDraftQuoteFromVerifiedInterest,
  type QuoteDraftCommandDeps,
} from "../tools/quote-draft-from-interest.js";
import { getQuoteDeliveryStatus, requestSendQuote } from "../tools/quote-send-request.js";

/** Domain permissions after ToolRouter + commercial gates. No send/approve/delete. */
const QUOTE_AGENT_DOMAIN_PERMISSIONS: ReadonlySet<string> = new Set([
  QUOTE_PERMISSIONS.view,
  QUOTE_PERMISSIONS.create,
  QUOTE_PERMISSIONS.edit,
]);

function buildQuoteContext(userId: string, companyId: string): QuoteServiceContext {
  return {
    userId,
    companyId,
    isSuperAdmin: false,
    hasPermission: (code: string) => QUOTE_AGENT_DOMAIN_PERMISSIONS.has(code),
  };
}

function readProductInterest(
  metadata: unknown,
): { productId: string; productName: string | null } | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const interest = (metadata as Record<string, unknown>).productInterest;
  if (!interest || typeof interest !== "object" || Array.isArray(interest)) return null;
  const productId =
    typeof (interest as Record<string, unknown>).productId === "string"
      ? String((interest as Record<string, unknown>).productId).trim()
      : "";
  if (!productId) return null;
  const nameRaw = (interest as Record<string, unknown>).productName;
  return {
    productId,
    productName: typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : null,
  };
}

export function createQuoteDraftCommandDeps(client: SupabaseClient): QuoteDraftCommandDeps {
  const platform = createQuotePlatformServices(client, {
    events: createNoopQuoteEventPublisher(),
  });

  const deps: QuoteDraftCommandDeps = {
    async loadLeadForConversation({ companyId, conversationId }) {
      const { data: conv, error: convError } = await client
        .from("conversations")
        .select("id, lead_id, company_id")
        .eq("id", conversationId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();
      if (convError) throw new Error(convError.message);
      let leadId = conv?.lead_id ? String(conv.lead_id) : "";
      if (!leadId && conversationId) {
        const { data: byConversation, error: byConversationError } = await client
          .from("leads")
          .select("id")
          .eq("company_id", companyId)
          .eq("conversation_id", conversationId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (byConversationError) throw new Error(byConversationError.message);
        if (byConversation?.id) {
          leadId = String(byConversation.id);
          await client
            .from("conversations")
            .update({ lead_id: leadId })
            .eq("id", conversationId)
            .eq("company_id", companyId)
            .is("lead_id", null);
        }
      }
      if (!leadId) return null;

      const { data: lead, error: leadError } = await client
        .from("leads")
        .select("id, metadata, customer_id, is_qualified, company_id")
        .eq("id", leadId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();
      if (leadError) throw new Error(leadError.message);
      if (!lead) return null;

      return {
        leadId: String(lead.id),
        isQualified: lead.is_qualified === true,
        customerId: lead.customer_id ? String(lead.customer_id) : null,
        productInterest: readProductInterest(lead.metadata),
      };
    },

    async findOpenOpportunityForLead({ companyId, leadId }) {
      const { data: rows, error } = await client
        .from("opportunities")
        .select(
          "id, lead_id, currency, country, market, name, customer_id, primary_contact_name, won_at, lost_at",
        )
        .eq("company_id", companyId)
        .eq("lead_id", leadId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(5);
      if (error) throw new Error(error.message);
      const open = (rows ?? []).find((row) => !row.won_at && !row.lost_at);
      if (!open) return null;
      return {
        id: String(open.id),
        leadId: String(open.lead_id),
        currency: typeof open.currency === "string" ? open.currency : null,
        country: typeof open.country === "string" ? open.country : null,
        market: typeof open.market === "string" ? open.market : null,
        name: typeof open.name === "string" ? open.name : "Opportunity",
        customerId: open.customer_id ? String(open.customer_id) : null,
        primaryContactName:
          typeof open.primary_contact_name === "string" ? open.primary_contact_name : "",
        isOpen: true,
      };
    },

    async findCurrentDraftForOpportunity({ companyId, opportunityId }) {
      // Use a system-scoped view context for listing; actor is not needed for reads here
      // but QuoteQueryService still requires quotes.view on the context.
      const ctx = buildQuoteContext("system-quote-draft-read", companyId);
      const listed = await platform.queries.listQuotes(ctx, {
        companyId,
        opportunityId,
        status: "draft",
        currentOnly: true,
        limit: 5,
        offset: 0,
      });
      const draft = listed.items[0];
      if (!draft) return null;
      const lines = await platform.queries.listLines(ctx, companyId, draft.id);
      return {
        quoteId: draft.id,
        quoteNumber: draft.quoteNumber,
        status: draft.status,
        currency: draft.currency,
        grandTotal: draft.grandTotal,
        lines: lines.map((line) => ({
          productId: line.productId,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
        })),
      };
    },

    async previewCatalogPrice({ companyId, productId, country, market }) {
      // Company-scoped catalog + regional rows (same sources quote-platform addCatalogProduct uses).
      const { data: row, error } = await client
        .from("catalog_products")
        .select(
          "id, base_price, currency, subscription_price, product_type, is_active, deleted_at",
        )
        .eq("id", productId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row || row.is_active !== true) return null;

      const { data: regionalRows, error: regionalError } = await client
        .from("product_regional_prices")
        .select("country, market, region, local_price, currency_override, is_active")
        .eq("company_id", companyId)
        .eq("product_id", productId);
      if (regionalError) throw new Error(regionalError.message);

      const basePrice =
        row.product_type === "subscription" && row.subscription_price != null
          ? Number(row.subscription_price)
          : Number(row.base_price);
      const currency = typeof row.currency === "string" ? row.currency : "";
      if (!Number.isFinite(basePrice) || basePrice <= 0 || !currency) return null;

      const priced = resolveEffectivePrice({
        basePrice,
        currency,
        regionalPrices: (regionalRows ?? []).map((r, i) => ({
          id: String(i),
          companyId,
          productId,
          country: r.country ?? null,
          market: r.market ?? null,
          region: r.region ?? null,
          localPrice: Number(r.local_price),
          currencyOverride: r.currency_override ?? null,
          isActive: r.is_active === true,
          createdAt: "",
          updatedAt: "",
        })),
        country,
        market,
      });
      if (!Number.isFinite(priced.unitPrice) || priced.unitPrice <= 0) return null;
      return {
        unitPrice: priced.unitPrice,
        currency: priced.currency,
        source: priced.source,
      };
    },

    async createDraftFromOpportunity({ companyId, userId, opportunityId, title }) {
      const ctx = buildQuoteContext(userId, companyId);
      const result = await platform.commands.createFromOpportunity(ctx, {
        companyId,
        opportunityId,
        title,
      });
      return {
        quoteId: result.quote.id,
        quoteNumber: result.quote.quoteNumber,
        currency: result.quote.currency,
        grandTotal: result.quote.grandTotal,
      };
    },

    async ensurePricedCatalogLine({ companyId, userId, quoteId, productId, quantity }) {
      const ctx = buildQuoteContext(userId, companyId);
      const lines = await platform.queries.listLines(ctx, companyId, quoteId);
      const existing = lines.find((line) => line.productId === productId);
      if (existing && existing.unitPrice > 0) {
        const quote = await platform.queries.getQuote(ctx, companyId, quoteId);
        const preview = await deps.previewCatalogPrice({
          companyId,
          productId,
          country: quote?.country ?? null,
          market: quote?.market ?? null,
        });
        return {
          unitPrice: existing.unitPrice,
          currency: existing.currency,
          grandTotal: quote?.grandTotal ?? existing.total,
          priceSource: preview?.source ?? "global",
        };
      }

      if (existing && existing.unitPrice <= 0) {
        await platform.commands.removeLine(ctx, {
          companyId,
          quoteId,
          lineId: existing.id,
        });
      }

      const { line, quote } = await platform.commands.addCatalogProduct(ctx, {
        companyId,
        quoteId,
        productId,
        quantity,
      });
      if (!Number.isFinite(line.unitPrice) || line.unitPrice <= 0) {
        throw new Error("Catalog pricing returned a non-listable unit price.");
      }
      const preview = await deps.previewCatalogPrice({
        companyId,
        productId,
        country: quote.country,
        market: quote.market,
      });
      return {
        unitPrice: line.unitPrice,
        currency: line.currency,
        grandTotal: quote.grandTotal,
        priceSource: preview?.source ?? "global",
      };
    },
  };

  return deps;
}

export function createQuoteDeliveryCommandDeps(client: SupabaseClient): QuoteDeliveryCommandDeps {
  const platform = createQuotePlatformServices(client, {
    events: createNoopQuoteEventPublisher(),
  });
  const draftDeps = createQuoteDraftCommandDeps(client);

  return {
    async loadQuoteForCompany({ companyId, quoteId }) {
      const ctx = buildQuoteContext("system-quote-delivery-read", companyId);
      const quote = await platform.queries.getQuote(ctx, companyId, quoteId);
      if (!quote) return null;
      const lines = await platform.queries.listLines(ctx, companyId, quoteId);
      return {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        status: quote.status,
        companyId: quote.companyId,
        opportunityId: quote.opportunityId,
        metadata: quote.metadata ?? {},
        lineCount: lines.length,
      };
    },

    async findLatestDraftQuoteForConversation({ companyId, conversationId }) {
      const lead = await draftDeps.loadLeadForConversation({ companyId, conversationId });
      if (!lead) return null;
      const opportunity = await draftDeps.findOpenOpportunityForLead({
        companyId,
        leadId: lead.leadId,
      });
      if (!opportunity) return null;
      const draft = await draftDeps.findCurrentDraftForOpportunity({
        companyId,
        opportunityId: opportunity.id,
      });
      return draft ? { quoteId: draft.quoteId } : null;
    },

    async loadLatestSendAttempt({ companyId, quoteId }) {
      const { data, error } = await client
        .from("quote_send_attempts")
        .select("status, channel, error_code, created_at")
        .eq("company_id", companyId)
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const status = data.status === "sent" || data.status === "failed" || data.status === "pending"
        ? data.status
        : null;
      if (!status) return null;
      return {
        status,
        channel: typeof data.channel === "string" ? data.channel : null,
        errorCode: typeof data.error_code === "string" ? data.error_code : null,
        createdAt: typeof data.created_at === "string" ? data.created_at : null,
      };
    },

    async writeAiSendRequest({ companyId, quoteId, userId, metadata, request }) {
      // Metadata-only write under company scope. Never calls QuoteSendService / channel dispatch.
      const { error } = await client
        .from("quotes")
        .update({
          metadata,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId)
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);

      const { error: historyError } = await client.from("quote_history").insert({
        company_id: companyId,
        quote_id: quoteId,
        event_type: "quote_send_requested",
        summary: `AI requested human send approval via ${request.channel}`,
        payload: {
          channel: request.channel,
          status: request.status,
          conversationId: request.conversationId,
          source: "ai_request_send_quote",
        },
        actor_user_id: userId,
      });
      if (historyError) {
        console.warn("[quote-agent] quote_send_requested history failed", historyError.message);
      }
    },
  };
}

export function createSupabaseQuoteAgentPorts(
  client: SupabaseClient,
  options?: { showProductPrices?: () => boolean },
): QuoteAgentToolPorts {
  const draftDeps = createQuoteDraftCommandDeps(client);
  const deliveryDeps = createQuoteDeliveryCommandDeps(client);
  return {
    showProductPrices() {
      return options?.showProductPrices?.() === true;
    },
    createDraftQuoteFromVerifiedInterest(input) {
      return createDraftQuoteFromVerifiedInterest(draftDeps, input);
    },
    requestSendQuote(input) {
      return requestSendQuote(deliveryDeps, input);
    },
    getQuoteDeliveryStatus(input) {
      return getQuoteDeliveryStatus(deliveryDeps, input);
    },
  };
}
