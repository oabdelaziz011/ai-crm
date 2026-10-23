/**
 * AI quote ports — draft creation + human send-request / delivery status.
 * Autonomous send / approve / convert / payment must never be exposed here.
 */

import type {
  GetQuoteDeliveryStatusResult,
  RequestSendQuoteResult,
} from "./quote-send-request.js";

export type QuoteDraftPriceSource = "global" | "regional";

export type QuoteDraftSuccessResult = {
  ok: true;
  created: boolean;
  alreadyExists: boolean;
  draftOnly: true;
  status: "draft";
  quoteId: string;
  quoteNumber: string;
  opportunityId: string;
  leadId: string;
  productId: string;
  productName: string | null;
  quantity: number;
  currency: string;
  grandTotal: number;
  unitPrice: number;
  priceSource: QuoteDraftPriceSource;
  /** Explains that global base_price is not a confirmed regional override. */
  priceSourceNote: string;
  message: string;
};

export type QuoteDraftNeedsDataResult = {
  ok: false;
  status: "needs_data";
  missing: string[];
  askCustomer: string;
  message: string;
};

export type QuoteDraftDeniedResult = {
  ok: false;
  status: "denied";
  errorCode: "PERMISSION_DENIED" | "COMPANY_MISMATCH" | "OPPORTUNITY_MISMATCH";
  message: string;
};

export type QuoteDraftFailedResult = {
  ok: false;
  status: "failed";
  errorCode: "PRICING_FAILED" | "CREATE_FAILED" | "PRODUCT_NOT_FOUND" | "INTERNAL";
  message: string;
};

export type QuoteDraftToolResult =
  | QuoteDraftSuccessResult
  | QuoteDraftNeedsDataResult
  | QuoteDraftDeniedResult
  | QuoteDraftFailedResult;

export type QuoteAgentToolPorts = {
  /**
   * When false, create_draft_quote must omit unitPrice/grandTotal from the tool
   * payload so the model cannot leak prices to the customer.
   */
  showProductPrices?: () => boolean;

  /**
   * Create or reuse a draft quote for the conversation's lead + open opportunity
   * using verified product interest. Never sends or approves.
   */
  createDraftQuoteFromVerifiedInterest(input: {
    companyId: string;
    userId: string;
    conversationId: string;
    title?: string;
    quantity?: number;
    /** Optional; when set must equal verified productInterest.productId. */
    productId?: string;
  }): Promise<QuoteDraftToolResult>;

  /**
   * Queue a human send-approval request. Must never call QuoteSendService / channel dispatch.
   */
  requestSendQuote(input: {
    companyId: string;
    userId: string;
    conversationId: string;
    quoteId?: string;
    channel?: "email" | "whatsapp";
  }): Promise<RequestSendQuoteResult>;

  /**
   * Persisted company policy only. Absent means human approval.
   * Model text must never be passed here.
   */
  readPersistedQuoteSendPolicy?(input: { companyId: string }): Promise<string | null>;

  /** True only after the server checked quotes.send. Not a model argument. */
  serverAuthorizedQuoteSend?(input: { companyId: string }): boolean;

  /**
   * Optional direct send. Invoked only when persisted policy and quotes.send both pass.
   * Hosts without this method stay on human approval.
   */
  sendAuthorizedQuote?(input: {
    companyId: string;
    userId: string;
    conversationId: string;
    quoteId?: string;
    channel?: "email" | "whatsapp";
  }): Promise<{
    ok: boolean;
    sent: boolean;
    deliveryState: string;
    quoteId?: string;
    quoteNumber?: string;
    message: string;
    errorCode?: string;
  }>;

  /**
   * Read delivery state from quote row + quote_send_attempts + aiSendRequest metadata.
   */
  getQuoteDeliveryStatus(input: {
    companyId: string;
    conversationId: string;
    quoteId?: string;
  }): Promise<GetQuoteDeliveryStatusResult>;
};
