export const PRODUCT_PERMISSIONS = {
  view: "products.view",
  create: "products.create",
  edit: "products.edit",
  delete: "products.delete",
  pricing: "products.pricing",
} as const;

export const PRODUCT_TYPES = [
  "product",
  "service",
  "subscription",
  "bundle",
  "addon",
] as const;

export const PRODUCT_HISTORY_EVENTS = [
  "product_created",
  "product_updated",
  "product_archived",
  "price_changed",
  "category_changed",
  "regional_price_changed",
  "bundle_updated",
] as const;

export const SUBSCRIPTION_INTERVALS = ["month", "year", "quarter"] as const;
