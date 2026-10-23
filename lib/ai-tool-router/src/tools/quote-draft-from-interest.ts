/**
 * AI-Assisted Quote Draft Creation — orchestration (no parallel quote engine).
 *
 * Uses quote-platform via injected deps. Draft-only; never send/approve/order/pay.
 */

import type {
  QuoteDraftPriceSource,
  QuoteDraftToolResult,
} from "./quote-agent-ports.js";
import { QUOTE_DRAFT_MAX_QUANTITY } from "./quote-tool-definitions.js";

export type QuoteDraftLeadContext = {
  leadId: string;
  isQualified: boolean;
  customerId: string | null;
  productInterest: { productId: string; productName: string | null } | null;
};

export type QuoteDraftOpportunityContext = {
  id: string;
  leadId: string;
  currency: string | null;
  country: string | null;
  market: string | null;
  name: string;
  customerId: string | null;
  primaryContactName: string;
  isOpen: boolean;
};

export type QuoteDraftExistingQuote = {
  quoteId: string;
  quoteNumber: string;
  status: string;
  currency: string;
  grandTotal: number;
  lines: Array<{ productId: string | null; unitPrice: number; quantity: number }>;
};

export type QuoteDraftCatalogPrice = {
  unitPrice: number;
  currency: string;
  source: QuoteDraftPriceSource;
};

export type QuoteDraftCommandDeps = {
  loadLeadForConversation(input: {
    companyId: string;
    conversationId: string;
  }): Promise<QuoteDraftLeadContext | null>;

  findOpenOpportunityForLead(input: {
    companyId: string;
    leadId: string;
  }): Promise<QuoteDraftOpportunityContext | null>;

  findCurrentDraftForOpportunity(input: {
    companyId: string;
    opportunityId: string;
  }): Promise<QuoteDraftExistingQuote | null>;

  /** Preview catalog price via resolveEffectivePrice (or equivalent). Never invent. */
  previewCatalogPrice(input: {
    companyId: string;
    productId: string;
    country: string | null;
    market: string | null;
  }): Promise<QuoteDraftCatalogPrice | null>;

  createDraftFromOpportunity(input: {
    companyId: string;
    userId: string;
    opportunityId: string;
    title?: string;
  }): Promise<{ quoteId: string; quoteNumber: string; currency: string; grandTotal: number }>;

  ensurePricedCatalogLine(input: {
    companyId: string;
    userId: string;
    quoteId: string;
    productId: string;
    quantity: number;
  }): Promise<{
    unitPrice: number;
    currency: string;
    grandTotal: number;
    priceSource: QuoteDraftPriceSource;
  }>;
};

const GLOBAL_PRICE_NOTE =
  "Listed unit price uses catalog base pricing (resolveEffectivePrice source=global). " +
  "It is not a confirmed regional override. Regional price applies only when the opportunity " +
  "has a verified country/market that matches product_regional_prices.";

const REGIONAL_PRICE_NOTE =
  "Listed unit price uses a matching product_regional_prices row for the opportunity country/market.";

function clampQuantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(QUOTE_DRAFT_MAX_QUANTITY, Math.max(1, Math.trunc(value)));
}

function successMessage(alreadyExists: boolean): string {
  return alreadyExists
    ? "An internal draft quote already exists for this opportunity and product. It was NOT sent and is NOT approved."
    : "Internal draft quote created successfully. It was NOT sent to the customer and is NOT approved.";
}

function pricedLine(
  draft: QuoteDraftExistingQuote,
  productId: string,
): { unitPrice: number; quantity: number } | null {
  const line = draft.lines.find(
    (entry) => entry.productId === productId && Number.isFinite(entry.unitPrice) && entry.unitPrice > 0,
  );
  return line ? { unitPrice: line.unitPrice, quantity: line.quantity } : null;
}

/**
 * Create or reuse a draft quote from verified product interest on the conversation lead.
 */
export async function createDraftQuoteFromVerifiedInterest(
  deps: QuoteDraftCommandDeps,
  input: {
    companyId: string;
    userId: string;
    conversationId: string;
    title?: string;
    quantity?: number;
    productId?: string;
  },
): Promise<QuoteDraftToolResult> {
  const companyId = input.companyId.trim();
  const userId = input.userId.trim();
  const conversationId = input.conversationId.trim();
  if (!companyId || !userId || !conversationId) {
    return {
      ok: false,
      status: "denied",
      errorCode: "COMPANY_MISMATCH",
      message: "Trusted company, user, and conversation context are required.",
    };
  }

  const quantity = clampQuantity(input.quantity);
  const lead = await deps.loadLeadForConversation({ companyId, conversationId });
  if (!lead) {
    return {
      ok: false,
      status: "needs_data",
      missing: ["lead"],
      askCustomer: "I need an active sales lead on this conversation before preparing a quote draft.",
      message: "No lead is linked to this conversation.",
    };
  }

  const interest = lead.productInterest;
  if (!interest?.productId?.trim()) {
    return {
      ok: false,
      status: "needs_data",
      missing: ["productInterest"],
      askCustomer:
        "Which product should the quote cover? I can search the catalog once you name it, then prepare an internal draft.",
      message: "Verified product interest is missing on the lead.",
    };
  }

  const productId = interest.productId.trim();
  const requestedProductId = typeof input.productId === "string" ? input.productId.trim() : "";
  if (requestedProductId && requestedProductId !== productId) {
    return {
      ok: false,
      status: "needs_data",
      missing: ["productId_match"],
      askCustomer:
        "The product you named does not match the verified product interest on this lead. Confirm the product first.",
      message: "Requested productId does not match verified product interest.",
    };
  }

  if (!lead.isQualified) {
    return {
      ok: false,
      status: "needs_data",
      missing: ["lead_qualified"],
      askCustomer: "This lead still needs qualification before I can prepare a quote draft for the team.",
      message: "Lead is not qualified.",
    };
  }

  const opportunity = await deps.findOpenOpportunityForLead({ companyId, leadId: lead.leadId });
  if (!opportunity || !opportunity.isOpen) {
    return {
      ok: false,
      status: "needs_data",
      missing: ["opportunity"],
      askCustomer:
        "There is no open opportunity for this lead yet. A team member needs to open one before a quote draft can be created.",
      message: "No open opportunity found for this lead.",
    };
  }

  if (opportunity.leadId !== lead.leadId) {
    return {
      ok: false,
      status: "denied",
      errorCode: "OPPORTUNITY_MISMATCH",
      message: "Opportunity is not linked to this conversation lead.",
    };
  }

  if (!opportunity.currency?.trim()) {
    return {
      ok: false,
      status: "needs_data",
      missing: ["opportunity_currency"],
      askCustomer: "The opportunity needs a currency before a quote draft can be priced.",
      message: "Opportunity currency is required.",
    };
  }

  const preview = await deps.previewCatalogPrice({
    companyId,
    productId,
    country: opportunity.country,
    market: opportunity.market,
  });
  if (!preview || !Number.isFinite(preview.unitPrice) || preview.unitPrice <= 0 || !preview.currency?.trim()) {
    return {
      ok: false,
      status: "failed",
      errorCode: "PRICING_FAILED",
      message:
        "Catalog pricing is unavailable or not listable for this product. A human must set a valid catalog/regional price before drafting.",
    };
  }

  const existing = await deps.findCurrentDraftForOpportunity({
    companyId,
    opportunityId: opportunity.id,
  });
  if (existing && existing.status === "draft") {
    const line = pricedLine(existing, productId);
    if (line) {
      return {
        ok: true,
        created: false,
        alreadyExists: true,
        draftOnly: true,
        status: "draft",
        quoteId: existing.quoteId,
        quoteNumber: existing.quoteNumber,
        opportunityId: opportunity.id,
        leadId: lead.leadId,
        productId,
        productName: interest.productName,
        quantity: line.quantity,
        currency: existing.currency,
        grandTotal: existing.grandTotal,
        unitPrice: line.unitPrice,
        priceSource: preview.source,
        priceSourceNote: preview.source === "regional" ? REGIONAL_PRICE_NOTE : GLOBAL_PRICE_NOTE,
        message: successMessage(true),
      };
    }

    try {
      const ensured = await deps.ensurePricedCatalogLine({
        companyId,
        userId,
        quoteId: existing.quoteId,
        productId,
        quantity,
      });
      return {
        ok: true,
        created: false,
        alreadyExists: true,
        draftOnly: true,
        status: "draft",
        quoteId: existing.quoteId,
        quoteNumber: existing.quoteNumber,
        opportunityId: opportunity.id,
        leadId: lead.leadId,
        productId,
        productName: interest.productName,
        quantity,
        currency: ensured.currency,
        grandTotal: ensured.grandTotal,
        unitPrice: ensured.unitPrice,
        priceSource: ensured.priceSource,
        priceSourceNote: ensured.priceSource === "regional" ? REGIONAL_PRICE_NOTE : GLOBAL_PRICE_NOTE,
        message: successMessage(true),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/permission|Missing permission/i.test(message)) {
        return {
          ok: false,
          status: "denied",
          errorCode: "PERMISSION_DENIED",
          message: "Missing quotes.edit permission to price the draft line.",
        };
      }
      return {
        ok: false,
        status: "failed",
        errorCode: "CREATE_FAILED",
        message: `Could not price the existing draft: ${message}`,
      };
    }
  }

  try {
    const created = await deps.createDraftFromOpportunity({
      companyId,
      userId,
      opportunityId: opportunity.id,
      title: input.title?.trim() || undefined,
    });

    const ensured = await deps.ensurePricedCatalogLine({
      companyId,
      userId,
      quoteId: created.quoteId,
      productId,
      quantity,
    });

    return {
      ok: true,
      created: true,
      alreadyExists: false,
      draftOnly: true,
      status: "draft",
      quoteId: created.quoteId,
      quoteNumber: created.quoteNumber,
      opportunityId: opportunity.id,
      leadId: lead.leadId,
      productId,
      productName: interest.productName,
      quantity,
      currency: ensured.currency,
      grandTotal: ensured.grandTotal,
      unitPrice: ensured.unitPrice,
      priceSource: ensured.priceSource,
      priceSourceNote: ensured.priceSource === "regional" ? REGIONAL_PRICE_NOTE : GLOBAL_PRICE_NOTE,
      message: successMessage(false),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/permission|Missing permission/i.test(message)) {
      return {
        ok: false,
        status: "denied",
        errorCode: "PERMISSION_DENIED",
        message: "Missing quotes.create or quotes.edit permission for draft creation.",
      };
    }
    if (/not found|inactive/i.test(message)) {
      return {
        ok: false,
        status: "failed",
        errorCode: "PRODUCT_NOT_FOUND",
        message,
      };
    }
    if (/pric|currency/i.test(message)) {
      return {
        ok: false,
        status: "failed",
        errorCode: "PRICING_FAILED",
        message,
      };
    }
    return {
      ok: false,
      status: "failed",
      errorCode: "CREATE_FAILED",
      message: `Draft quote creation failed: ${message}`,
    };
  }
}
