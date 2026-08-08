import type {
  QuoteApprovalRecord,
  QuoteHistoryRecord,
  QuoteLineItemRecord,
  QuoteLineKind,
  QuoteRecord,
  QuoteStatus,
  QuoteTemplateRecord,
} from "../types.js";

export type CreateQuoteInput = {
  companyId: string;
  quoteFamilyId: string;
  versionNumber: number;
  quoteNumber: string;
  opportunityId?: string | null;
  customerId?: string | null;
  templateId?: string | null;
  status?: QuoteStatus;
  title?: string;
  contactName?: string;
  currency?: string;
  language?: string;
  country?: string | null;
  market?: string | null;
  validUntil?: string | null;
  ownerUserId?: string | null;
  notes?: string;
  opportunityProbabilityPercent?: number | null;
  isCurrent?: boolean;
  metadata?: Record<string, unknown>;
  createdBy: string | null;
};

export type UpsertQuoteLineInput = {
  companyId: string;
  quoteId: string;
  id?: string;
  lineKind: QuoteLineKind;
  productId?: string | null;
  productNameSnapshot: string;
  skuSnapshot?: string;
  sectionTitle?: string | null;
  notes?: string;
  isOptional?: boolean;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  sortOrder?: number;
  actorUserId: string | null;
};

export interface QuoteRepository {
  ensureDefaultTemplates(companyId: string): Promise<void>;
  listTemplates(companyId: string): Promise<QuoteTemplateRecord[]>;
  getTemplate(companyId: string, templateId: string): Promise<QuoteTemplateRecord | null>;

  createQuote(input: CreateQuoteInput): Promise<QuoteRecord>;
  updateQuote(input: {
    companyId: string;
    quoteId: string;
    updatedBy: string | null;
    status?: QuoteStatus;
    title?: string;
    contactName?: string;
    currency?: string;
    language?: string;
    country?: string | null;
    market?: string | null;
    validUntil?: string | null;
    ownerUserId?: string | null;
    notes?: string;
    subtotal?: number;
    discountTotal?: number;
    taxTotal?: number;
    shippingTotal?: number;
    grandTotal?: number;
    weightedRevenue?: number | null;
    opportunityProbabilityPercent?: number | null;
    isCurrent?: boolean;
    supersededByQuoteId?: string | null;
    sentAt?: string | null;
    viewedAt?: string | null;
    acceptedAt?: string | null;
    rejectedAt?: string | null;
    expiredAt?: string | null;
    convertedAt?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<QuoteRecord>;
  softDeleteQuote(companyId: string, quoteId: string, updatedBy: string | null): Promise<void>;
  getQuote(companyId: string, quoteId: string): Promise<QuoteRecord | null>;
  listQuotes(input: {
    companyId: string;
    opportunityId?: string;
    status?: QuoteStatus;
    currentOnly?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ items: QuoteRecord[]; total: number }>;
  listVersions(companyId: string, quoteFamilyId: string): Promise<QuoteRecord[]>;
  nextQuoteNumber(companyId: string): Promise<string>;

  listLines(companyId: string, quoteId: string): Promise<QuoteLineItemRecord[]>;
  upsertLine(input: UpsertQuoteLineInput): Promise<QuoteLineItemRecord>;
  removeLine(companyId: string, lineId: string, actorUserId: string | null): Promise<void>;
  copyLines(input: {
    companyId: string;
    fromQuoteId: string;
    toQuoteId: string;
    actorUserId: string | null;
  }): Promise<QuoteLineItemRecord[]>;

  createApproval(input: {
    companyId: string;
    quoteId: string;
    requestedBy: string | null;
  }): Promise<QuoteApprovalRecord>;
  decideApproval(input: {
    companyId: string;
    approvalId: string;
    status: "approved" | "rejected";
    decidedBy: string | null;
    decisionNote?: string;
  }): Promise<QuoteApprovalRecord>;
  listApprovals(companyId: string, quoteId: string): Promise<QuoteApprovalRecord[]>;

  addHistory(input: {
    companyId: string;
    quoteId: string;
    eventType: string;
    fieldName?: string | null;
    previousValue?: string | null;
    newValue?: string | null;
    summary?: string;
    payload?: Record<string, unknown>;
    actorUserId: string | null;
  }): Promise<QuoteHistoryRecord>;
  listHistory(companyId: string, quoteId: string, limit?: number): Promise<QuoteHistoryRecord[]>;

  setOpportunityCurrentQuote(input: {
    companyId: string;
    opportunityId: string;
    quoteId: string | null;
  }): Promise<void>;

  getOpportunitySnapshot(
    companyId: string,
    opportunityId: string,
  ): Promise<{
    id: string;
    name: string;
    customerId: string | null;
    companyName: string | null;
    primaryContactName: string;
    ownerUserId: string | null;
    currency: string;
    country: string | null;
    market: string | null;
    language: string | null;
    probabilityPercent: number;
    expectedRevenue: number | null;
  } | null>;

  listOpportunityLines(
    companyId: string,
    opportunityId: string,
  ): Promise<
    Array<{
      productId: string;
      productNameSnapshot: string;
      skuSnapshot: string;
      quantity: number;
      unitPrice: number;
      discountPercent: number;
      taxPercent: number;
      currency: string;
    }>
  >;

  getCatalogProduct(
    companyId: string,
    productId: string,
  ): Promise<{
    id: string;
    name: string;
    sku: string;
    productType: string;
    basePrice: number;
    currency: string;
    subscriptionPrice: number | null;
    isActive: boolean;
  } | null>;

  listRegionalPrices(
    companyId: string,
    productId: string,
  ): Promise<
    Array<{
      country: string | null;
      market: string | null;
      region: string | null;
      localPrice: number;
      currencyOverride: string | null;
      isActive: boolean;
    }>
  >;
}
