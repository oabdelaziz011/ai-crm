/**
 * Shared sales-catalog localization (opportunities stages, products, quotes).
 */

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function catalogKey(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function translateMapped(
  t: TranslateFn,
  map: Record<string, string>,
  value: string | null | undefined,
): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  const i18nKey = map[catalogKey(raw)] ?? map[raw.trim().toLowerCase()];
  if (!i18nKey) return raw;
  const translated = t(i18nKey);
  return translated === i18nKey ? raw : translated;
}

const STAGE_I18N_KEYS: Record<string, string> = {
  qualification: "opportunities.stages.qualification",
  discovery: "opportunities.stages.discovery",
  proposal: "opportunities.stages.proposal",
  negotiation: "opportunities.stages.negotiation",
  contract: "opportunities.stages.contract",
  won: "opportunities.stages.won",
  lost: "opportunities.stages.lost",
};

const PIPELINE_I18N_KEYS: Record<string, string> = {
  "sales execution": "opportunities.pipelines.salesExecution",
  "sales-execution": "opportunities.pipelines.salesExecution",
};

const PRODUCT_TYPE_KEYS: Record<string, string> = {
  product: "products.types.product",
  service: "products.types.service",
  subscription: "products.types.subscription",
  bundle: "products.types.bundle",
  addon: "products.types.addon",
  "add-on": "products.types.addon",
  "add on": "products.types.addon",
};

const QUOTE_STATUS_KEYS: Record<string, string> = {
  draft: "quotes.statuses.draft",
  in_review: "quotes.statuses.inReview",
  "in review": "quotes.statuses.inReview",
  sent: "quotes.statuses.sent",
  viewed: "quotes.statuses.viewed",
  accepted: "quotes.statuses.accepted",
  rejected: "quotes.statuses.rejected",
  expired: "quotes.statuses.expired",
  superseded: "quotes.statuses.superseded",
  converted: "quotes.statuses.converted",
};

export function localizeOpportunityStageName(
  t: TranslateFn,
  name: string | null | undefined,
): string {
  return translateMapped(t, STAGE_I18N_KEYS, name) || (name?.trim() ?? "");
}

export function localizeOpportunityPipelineName(
  t: TranslateFn,
  name: string | null | undefined,
): string {
  return translateMapped(t, PIPELINE_I18N_KEYS, name) || (name?.trim() ?? "");
}

export function localizeProductType(t: TranslateFn, type: string | null | undefined): string {
  return translateMapped(t, PRODUCT_TYPE_KEYS, type) || (type?.trim() ?? "");
}

export function localizeQuoteStatus(t: TranslateFn, status: string | null | undefined): string {
  return translateMapped(t, QUOTE_STATUS_KEYS, status) || (status?.trim() ?? "");
}

export function formatSalesMoney(
  value: number | null | undefined,
  currency: string,
  locale?: string,
): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "USD",
    }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency}`;
  }
}
