export const SEARCH_PRODUCTS_TOOL_KEY = "search_products";
export const GET_PRODUCT_DETAILS_TOOL_KEY = "get_product_details";

export const PRODUCT_TOOL_KEYS = [SEARCH_PRODUCTS_TOOL_KEY, GET_PRODUCT_DETAILS_TOOL_KEY] as const;

/** Browse/list replies should show a short catalog page, not a single hit. */
export const PRODUCT_SEARCH_MAX_LIMIT = 12;
export const PRODUCT_DETAILS_MAX_IDS = 3;
