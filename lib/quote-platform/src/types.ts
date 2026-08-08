import type { QUOTE_APPROVAL_STATUSES, QUOTE_LINE_KINDS, QUOTE_STATUSES } from "./constants.js";
import { computeLineAmounts } from "@workspace/product-platform";

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export type QuoteLineKind = (typeof QUOTE_LINE_KINDS)[number];
export type QuoteApprovalStatus = (typeof QUOTE_APPROVAL_STATUSES)[number];

export type QuoteServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

export type QuoteRecord = {
  id: string;
  companyId: string;
  quoteFamilyId: string;
  versionNumber: number;
  quoteNumber: string;
  opportunityId: string | null;
  customerId: string | null;
  templateId: string | null;
  status: QuoteStatus;
  title: string;
  contactName: string;
  currency: string;
  language: string;
  country: string | null;
  market: string | null;
  validUntil: string | null;
  ownerUserId: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  grandTotal: number;
  weightedRevenue: number | null;
  opportunityProbabilityPercent: number | null;
  notes: string;
  isCurrent: boolean;
  supersededByQuoteId: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  expiredAt: string | null;
  convertedAt: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuoteLineItemRecord = {
  id: string;
  companyId: string;
  quoteId: string;
  lineKind: QuoteLineKind;
  productId: string | null;
  productNameSnapshot: string;
  skuSnapshot: string;
  sectionTitle: string | null;
  notes: string;
  isOptional: boolean;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type QuoteTemplateRecord = {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  description: string;
  defaultLanguage: string;
  defaultCurrency: string;
  validityDays: number;
  bodyJson: Record<string, unknown>;
  isActive: boolean;
};

export type QuoteApprovalRecord = {
  id: string;
  companyId: string;
  quoteId: string;
  status: QuoteApprovalStatus;
  requestedBy: string | null;
  decidedBy: string | null;
  decisionNote: string;
  requestedAt: string;
  decidedAt: string | null;
};

export type QuoteHistoryRecord = {
  id: string;
  companyId: string;
  quoteId: string;
  eventType: string;
  fieldName: string | null;
  previousValue: string | null;
  newValue: string | null;
  summary: string;
  payload: Record<string, unknown>;
  actorUserId: string | null;
  createdAt: string;
};

export function computeQuoteLineAmounts(input: {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount?: number;
  taxPercent: number;
}): { discountAmount: number; subtotal: number; taxAmount: number; total: number } {
  const qty = Math.max(0, input.quantity);
  const unit = Math.max(0, input.unitPrice);
  const gross = qty * unit;
  let discountAmount =
    input.discountAmount != null && input.discountAmount > 0
      ? Math.min(gross, input.discountAmount)
      : Math.round(gross * (Math.min(100, Math.max(0, input.discountPercent)) / 100) * 100) / 100;
  const net = Math.max(0, Math.round((gross - discountAmount) * 100) / 100);
  const taxAmount = Math.round(net * (Math.min(100, Math.max(0, input.taxPercent)) / 100) * 100) / 100;
  const total = Math.round((net + taxAmount) * 100) / 100;
  // Keep percent-path compatible with product compute when no amount override
  if (!(input.discountAmount != null && input.discountAmount > 0)) {
    const viaPercent = computeLineAmounts({
      quantity: qty,
      unitPrice: unit,
      discountPercent: input.discountPercent,
      taxPercent: input.taxPercent,
    });
    return {
      discountAmount: Math.round((gross - viaPercent.subtotal) * 100) / 100,
      subtotal: viaPercent.subtotal,
      taxAmount: viaPercent.taxAmount,
      total: viaPercent.total,
    };
  }
  return { discountAmount, subtotal: net, taxAmount, total };
}

export function computeQuoteTotals(lines: readonly QuoteLineItemRecord[]): {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
} {
  const commercial = lines.filter((l) => !["section", "note"].includes(l.lineKind));
  const subtotal = Math.round(commercial.reduce((s, l) => s + l.quantity * l.unitPrice, 0) * 100) / 100;
  const discountTotal = Math.round(commercial.reduce((s, l) => s + l.discountAmount, 0) * 100) / 100;
  const taxTotal = Math.round(commercial.reduce((s, l) => s + l.taxAmount, 0) * 100) / 100;
  const grandTotal = Math.round(commercial.reduce((s, l) => s + l.total, 0) * 100) / 100;
  return { subtotal, discountTotal, taxTotal, grandTotal };
}

export function computeWeightedRevenue(
  grandTotal: number,
  probabilityPercent: number | null,
): number | null {
  if (probabilityPercent == null || !Number.isFinite(probabilityPercent)) return null;
  return Math.round(grandTotal * (probabilityPercent / 100) * 100) / 100;
}
