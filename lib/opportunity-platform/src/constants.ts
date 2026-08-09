export const OPPORTUNITY_PERMISSIONS = {
  view: "opportunities.view",
  create: "opportunities.create",
  edit: "opportunities.edit",
  delete: "opportunities.delete",
  convert: "opportunities.convert",
} as const;

/** Canonical opportunity pipeline stage keys — configuration remains dynamic via stage rows. */
export const OPPORTUNITY_STAGE_KEYS = [
  "qualification",
  "discovery",
  "proposal",
  "negotiation",
  "contract",
  "won",
  "lost",
] as const;

export const OPPORTUNITY_HISTORY_EVENTS = [
  "opportunity_created",
  "stage_changed",
  "probability_changed",
  "amount_changed",
  "owner_changed",
  "archived",
  "restored",
  "product_attached",
  "product_removed",
  "quantity_changed",
  "unit_price_changed",
  "discount_changed",
  "tax_changed",
  "products_added",
  "quote_created",
  "quote_version_created",
  "quote_submitted",
  "quote_approved",
  "quote_rejected",
  "quote_status_changed",
  "negotiation_started",
  "won",
  "lost",
] as const;

export const DEFAULT_STAGE_PROBABILITY: Record<(typeof OPPORTUNITY_STAGE_KEYS)[number], number> = {
  qualification: 10,
  discovery: 25,
  proposal: 45,
  negotiation: 65,
  contract: 85,
  won: 100,
  lost: 0,
};
