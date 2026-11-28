export const VALIDATE_DELIVERY_ZONE_TOOL_KEY = "validate_delivery_zone";
export const PREVIEW_SALES_ORDER_TOOL_KEY = "preview_sales_order";
export const CREATE_SALES_ORDER_TOOL_KEY = "create_sales_order";
export const LIST_CUSTOMER_ORDERS_TOOL_KEY = "list_customer_orders";
export const GET_CUSTOMER_ORDER_STATUS_TOOL_KEY = "get_customer_order_status";
export const LIST_CUSTOMER_ORDERS_FOR_CANCELLATION_TOOL_KEY = "list_customer_orders_for_cancellation";
export const GET_ORDER_CANCELLATION_ELIGIBILITY_TOOL_KEY = "get_order_cancellation_eligibility";
export const CONFIRM_ORDER_CANCELLATION_TOOL_KEY = "confirm_order_cancellation";

export const SALES_ORDER_TOOL_KEYS = [
  VALIDATE_DELIVERY_ZONE_TOOL_KEY,
  PREVIEW_SALES_ORDER_TOOL_KEY,
  CREATE_SALES_ORDER_TOOL_KEY,
  LIST_CUSTOMER_ORDERS_TOOL_KEY,
  GET_CUSTOMER_ORDER_STATUS_TOOL_KEY,
  LIST_CUSTOMER_ORDERS_FOR_CANCELLATION_TOOL_KEY,
  GET_ORDER_CANCELLATION_ELIGIBILITY_TOOL_KEY,
  CONFIRM_ORDER_CANCELLATION_TOOL_KEY,
] as const;

/** Statuses AI may surface for customer order Q&A (never invent outside this set). */
export const CUSTOMER_ORDER_STATUS_LOOKUP_STATUSES = [
  "pending_approval",
  "confirmed",
  "processing",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

export const SALES_ORDER_MAX_LINE_QUANTITY = 100;
export const SALES_ORDER_MAX_LINES = 20;
