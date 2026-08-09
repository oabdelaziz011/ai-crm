import type { OpportunityHistoryReadModel } from "@workspace/application-layer";
import type { OpportunityStageReadModel } from "@workspace/application-layer";
import { formatBillingDate } from "@/lib/billing/format";
import { formatOpportunityMoney } from "./opportunity360-ui";
import { getOpportunityStageDisplayName } from "@/hooks/opportunities/opportunity-pipeline-utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OpportunityAuditFormatContext = {
  t: (key: string, options?: Record<string, unknown>) => string;
  stageById: ReadonlyMap<string, OpportunityStageReadModel>;
  resolveUserName?: (userId: string) => string | null | undefined;
  opportunityCurrency?: string | null;
};

const FIELD_I18N_KEYS: Record<string, string> = {
  stage_id: "stage_id",
  stage: "stage_id",
  probability_percent: "probability_percent",
  probability: "probability_percent",
  owner_user_id: "owner_id",
  owner_id: "owner_id",
  expected_revenue: "amount",
  amount: "amount",
  expected_close_date: "close_date",
  close_date: "close_date",
  currency: "currency",
  name: "name",
  company_name: "company",
  primary_contact_name: "contact",
  weighted_revenue: "weighted_revenue",
  pipeline_id: "pipeline",
  customer_id: "customer",
  lead_id: "lead",
  quantity: "quantity",
  unit_price: "unit_price",
  discount_percent: "discount_percent",
  tax_percent: "tax_percent",
  status: "status",
};

export function isUuidValue(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function formatOpportunityAuditAction(
  item: OpportunityHistoryReadModel,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const key = `opportunities360.audit.events.${item.eventType}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return t("opportunities360.audit.events.unknown");
}

export function translateOpportunityAuditFieldName(
  fieldName: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!fieldName?.trim()) return "";
  const normalized = fieldName.trim().toLowerCase();
  const mapped = FIELD_I18N_KEYS[normalized] ?? normalized;
  const i18nKey = `opportunities360.audit.fields.${mapped}`;
  const translated = t(i18nKey);
  if (translated !== i18nKey) return translated;
  return t("opportunities360.audit.fields.unknown");
}

function resolveStageAuditLabel(
  value: string,
  stageById: ReadonlyMap<string, OpportunityStageReadModel>,
  empty: string,
): string {
  if (isUuidValue(value)) {
    const stage = stageById.get(value);
    return getOpportunityStageDisplayName(stage) || empty;
  }
  const normalized = value.trim().toLowerCase();
  const byReference = [...stageById.values()].find(
    (stage) =>
      stage.name.trim().toLowerCase() === normalized ||
      stage.slug.trim().toLowerCase() === normalized ||
      stage.stageKey.trim().toLowerCase() === normalized,
  );
  return getOpportunityStageDisplayName(byReference) || value.trim();
}

export function formatOpportunityAuditValue(
  fieldName: string | null | undefined,
  rawValue: string | null | undefined,
  ctx: OpportunityAuditFormatContext,
): string {
  if (rawValue == null || !String(rawValue).trim()) return "";
  const value = String(rawValue).trim();
  const field = fieldName?.trim().toLowerCase() ?? "";
  const empty = ctx.t("opportunities360.emptyValue");

  if (field === "stage_id" || field === "stage") {
    return resolveStageAuditLabel(value, ctx.stageById, empty);
  }

  if (field === "owner_user_id" || field === "owner_id") {
    if (isUuidValue(value)) {
      const name = ctx.resolveUserName?.(value)?.trim();
      return name || empty;
    }
    return value;
  }

  if (field === "pipeline_id" || field === "customer_id" || field === "lead_id") {
    if (isUuidValue(value)) return empty;
  }

  if (field === "probability_percent" || field === "probability") {
    const num = Number(value);
    if (!Number.isNaN(num)) {
      return ctx.t("opportunities360.audit.valuePercent", { value: num });
    }
  }

  if (
    field === "expected_revenue" ||
    field === "amount" ||
    field === "weighted_revenue" ||
    field === "unit_price"
  ) {
    const num = Number(value);
    if (!Number.isNaN(num)) {
      const formatted = formatOpportunityMoney(num, ctx.opportunityCurrency);
      if (formatted) return formatted;
    }
  }

  if (
    field === "expected_close_date" ||
    field === "close_date" ||
    field.endsWith("_at") ||
    field.includes("date")
  ) {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return formatBillingDate(value, field.endsWith("_at") || field.includes("time"));
    }
  }

  if (field === "currency") {
    return value.toUpperCase();
  }

  if (isUuidValue(value)) {
    return empty;
  }

  return value;
}

export function opportunityHistoryHasFieldDiff(item: OpportunityHistoryReadModel): boolean {
  return Boolean(item.fieldName?.trim() || item.previousValue != null || item.newValue != null);
}
