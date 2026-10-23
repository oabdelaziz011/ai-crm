export const CREATE_DRAFT_QUOTE_TOOL_KEY = "create_draft_quote";
export const REQUEST_SEND_QUOTE_TOOL_KEY = "request_send_quote";
export const GET_QUOTE_DELIVERY_STATUS_TOOL_KEY = "get_quote_delivery_status";

export const QUOTE_TOOL_KEYS = [
  CREATE_DRAFT_QUOTE_TOOL_KEY,
  REQUEST_SEND_QUOTE_TOOL_KEY,
  GET_QUOTE_DELIVERY_STATUS_TOOL_KEY,
] as const;

/** AI may only set a bounded quantity; discounts/tax overrides are not accepted. */
export const QUOTE_DRAFT_MAX_QUANTITY = 100;
