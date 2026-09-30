/**
 * Presentation of a Lead conversion result (Customer only / Customer + Opportunity).
 * Pure — shared by the Leads table, Kanban and Lead360 so all entry points report the same outcome.
 */

export type LeadConversionUiMode = "customer" | "customer_and_opportunity";

export type LeadConversionUiOutcome = Readonly<{
  customerId?: string | null;
  opportunityId?: string | null;
  customerCreated?: boolean | null;
  opportunityCreated?: boolean | null;
  alreadyConverted?: boolean;
}>;

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function describeLeadConversionOutcome(
  t: Translate,
  outcome: LeadConversionUiOutcome,
  mode: LeadConversionUiMode,
): { title: string; description?: string } {
  if (mode === "customer") {
    return { title: t("leads.kanban.actions.converted") };
  }

  const title = outcome.alreadyConverted
    ? t("leads.convert.alreadyConverted")
    : t("leads.convert.convertedWithOpportunity");

  const customerLine =
    outcome.customerCreated === true
      ? t("leads.convert.customerCreated")
      : outcome.customerCreated === false
        ? t("leads.convert.customerReused")
        : t("leads.convert.customerLinked");

  const opportunityLine = !outcome.opportunityId
    ? t("leads.convert.opportunityMissing")
    : outcome.opportunityCreated === true
      ? t("leads.convert.opportunityCreated")
      : t("leads.convert.opportunityReused");

  return { title, description: `${customerLine} · ${opportunityLine}` };
}
