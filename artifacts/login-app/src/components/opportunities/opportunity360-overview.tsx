import { useTranslation } from "react-i18next";
import type {
  OpportunityReadModel,
  OpportunityStageReadModel,
  QuoteReadModel,
} from "@workspace/application-layer";
import { resolveOpportunityStageLabel } from "@/hooks/opportunities/use-opportunity-pipeline";
import {
  emptyDisplayValue,
  formatOpportunityDate,
  formatOpportunityMoney,
} from "./opportunity360-ui";

export type Opportunity360NavigationHandlers = {
  onOpenCustomer?: (customerId: string) => void;
  onOpenCompany?: () => void;
  onOpenLead?: (leadId: string) => void;
  onOpenOwner?: (ownerId: string) => void;
  onOpenQuote?: (quoteId: string) => void;
};

export type Opportunity360LeadContext = {
  phone?: string | null;
  email?: string | null;
};

function Field({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string | null | undefined;
  onClick?: () => void;
}) {
  const display = value?.trim() || "—";
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      {onClick && value?.trim() ? (
        <button
          type="button"
          onClick={onClick}
          className="mt-0.5 truncate text-start text-[13px] font-medium underline-offset-2 hover:underline"
        >
          {display}
        </button>
      ) : (
        <div className="mt-0.5 truncate text-[13px] font-medium">{display}</div>
      )}
    </div>
  );
}

export function Opportunity360Overview({
  opportunity,
  locale,
  currentQuote,
  navigation,
  stageById,
  pipelineName,
  leadContext,
  productsCount,
}: {
  opportunity: OpportunityReadModel;
  locale: string;
  currentQuote: QuoteReadModel | null;
  navigation: Opportunity360NavigationHandlers;
  stageById: ReadonlyMap<string, OpportunityStageReadModel>;
  pipelineName?: string | null;
  leadContext?: Opportunity360LeadContext | null;
  productsCount?: number | null;
}) {
  const { t } = useTranslation("common");
  const empty = emptyDisplayValue(t);
  const stageLabel =
    resolveOpportunityStageLabel(stageById, opportunity.stageId, opportunity.stage) || empty;
  const quoteLabel = currentQuote
    ? [currentQuote.quoteNumber, currentQuote.title].filter(Boolean).join(" · ")
    : null;
  const contactName = opportunity.primaryContact?.trim() || null;
  const productsLabel =
    productsCount == null
      ? null
      : t("opportunities360.nav.productsCount", { count: productsCount });

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border/50 bg-muted/10 p-4 sm:p-5">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("opportunities360.sections.opportunity")}
        </h3>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("opportunities360.fields.name")} value={opportunity.name} />
          <Field label={t("opportunities360.fields.pipeline")} value={pipelineName} />
          <Field label={t("opportunities360.fields.stage")} value={stageLabel} />
          <Field
            label={t("opportunities360.fields.owner")}
            value={opportunity.owner}
            onClick={
              opportunity.ownerId && opportunity.owner?.trim() && navigation.onOpenOwner
                ? () => navigation.onOpenOwner!(opportunity.ownerId!)
                : undefined
            }
          />
          <Field
            label={t("opportunities360.fields.amount")}
            value={formatOpportunityMoney(opportunity.expectedRevenue, opportunity.currency) || null}
          />
          <Field
            label={t("opportunities360.fields.currency")}
            value={opportunity.currency?.trim().toUpperCase() || null}
          />
          <Field
            label={t("opportunities360.fields.probability")}
            value={`${opportunity.probabilityPercent}%`}
          />
          <Field
            label={t("opportunities360.fields.expectedCloseDate")}
            value={formatOpportunityDate(opportunity.expectedCloseDate, locale) || null}
          />
          <Field label={t("opportunities360.fields.productsCount")} value={productsLabel} />
        </div>
      </section>

      <section className="rounded-xl border border-border/50 bg-muted/10 p-4 sm:p-5">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("opportunities360.sections.customer")}
        </h3>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {opportunity.customerId && contactName ? (
            <Field
              label={t("opportunities360.fields.customer")}
              value={contactName}
              onClick={
                navigation.onOpenCustomer
                  ? () => navigation.onOpenCustomer!(opportunity.customerId!)
                  : undefined
              }
            />
          ) : opportunity.leadId ? (
            <Field
              label={t("opportunities360.fields.lead")}
              value={contactName || opportunity.leadId.slice(0, 8)}
              onClick={
                navigation.onOpenLead ? () => navigation.onOpenLead!(opportunity.leadId!) : undefined
              }
            />
          ) : null}
          <Field
            label={t("opportunities360.fields.company")}
            value={opportunity.companyName}
            onClick={
              opportunity.companyName?.trim() && navigation.onOpenCompany
                ? navigation.onOpenCompany
                : undefined
            }
          />
          <Field
            label={t("opportunities360.fields.primaryContact")}
            value={opportunity.primaryContact}
          />
          <Field
            label={t("opportunities360.fields.phone")}
            value={leadContext?.phone?.trim() || null}
          />
          <Field
            label={t("opportunities360.fields.email")}
            value={leadContext?.email?.trim() || null}
          />
          {currentQuote ? (
            <Field
              label={t("opportunities360.fields.currentQuote")}
              value={quoteLabel}
              onClick={
                navigation.onOpenQuote ? () => navigation.onOpenQuote!(currentQuote.id) : undefined
              }
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
