export const VALIDATE_DELIVERY_ZONE_TOOL_KEY = "validate_delivery_zone";
export const PREVIEW_SALES_ORDER_TOOL_KEY = "preview_sales_order";
export const CREATE_SALES_ORDER_TOOL_KEY = "create_sales_order";

export const SALES_ORDER_TOOL_KEYS = [
  VALIDATE_DELIVERY_ZONE_TOOL_KEY,
  PREVIEW_SALES_ORDER_TOOL_KEY,
  CREATE_SALES_ORDER_TOOL_KEY,
] as const;

export const SALES_ORDER_MAX_LINE_QUANTITY = 100;
export const SALES_ORDER_MAX_LINES = 20;
