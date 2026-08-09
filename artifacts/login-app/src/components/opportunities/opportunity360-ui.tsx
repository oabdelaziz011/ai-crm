import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { OpportunityHistoryReadModel, OpportunityStageReadModel } from "@workspace/application-layer";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { OverviewInfoCell } from "@/components/leads/lead360/lead360-ui";
import { getOpportunityStageDisplayName } from "@/hooks/opportunities/opportunity-pipeline-utils";
import { formatBillingCurrency, formatBillingDate } from "@/lib/billing/format";
import { cn } from "@/lib/utils";

export { OverviewInfoCell };

export function emptyDisplayValue(t: (key: string) => string): string {
  return t("opportunities360.emptyValue");
}

/** Formats money using the opportunity record currency only — never company billing default. */
export function formatOpportunityMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  const code = currency?.trim();
  if (!code) return "";
  return formatBillingCurrency(amount, code.toUpperCase());
}

export function formatOpportunityDate(
  value: string | null | undefined,
  _locale?: string,
): string {
  if (!value?.trim()) return "";
  return formatBillingDate(value, false);
}

export function formatOpportunityDateTime(
  value: string | null | undefined,
  _locale?: string,
): string {
  if (!value?.trim()) return "";
  return formatBillingDate(value, true);
}

export function translateOpportunityProbabilitySource(
  source: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!source?.trim()) return null;
  const key = `opportunities360.probabilitySource.${source.trim().toLowerCase()}`;
  const label = t(key);
  return label === key ? null : label;
}

export function translateOpportunityProbabilityReason(
  reason: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
  stageById?: ReadonlyMap<string, OpportunityStageReadModel>,
): string | null {
  if (!reason?.trim()) return null;

  const resolveStageName = (raw: string) => {
    const trimmed = raw.trim();
    if (stageById) {
      const normalized = trimmed.toLowerCase();
      const match = [...stageById.values()].find(
        (stage) =>
          stage.name.trim().toLowerCase() === normalized ||
          stage.slug.trim().toLowerCase() === normalized ||
          stage.stageKey.trim().toLowerCase() === normalized,
      );
      const fromPipeline = getOpportunityStageDisplayName(match);
      if (fromPipeline) return fromPipeline;
    }
    return trimmed;
  };

  const seeded = /^Seeded from stage (.+) after lead qualification$/i.exec(reason.trim());
  if (seeded?.[1]) {
    return t("opportunities360.probabilityReason.seededFromStage", {
      stage: resolveStageName(seeded[1]),
    });
  }
  const stageDefault = /^Stage default: (.+)$/i.exec(reason.trim());
  if (stageDefault?.[1]) {
    return t("opportunities360.probabilityReason.stageDefault", {
      stage: resolveStageName(stageDefault[1]),
    });
  }
  return null;
}

export function formatOpportunityScore(
  score: number | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (score == null || Number.isNaN(score)) return null;
  return t("opportunities360.scoreFormat", {
    score: Math.round(score),
    max: 100,
  });
}

export function resolveOpportunityCreatedByUserId(
  history: readonly OpportunityHistoryReadModel[],
): string | null {
  const created = history.find((item) => item.eventType === "opportunity_created");
  return created?.actorUserId?.trim() ? created.actorUserId : null;
}

export function formatCountryMarket(
  country: string | null | undefined,
  market: string | null | undefined,
): string {
  return [country, market].filter(Boolean).join(" · ");
}

export function Opportunity360NavLink({
  label,
  value,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <OverviewInfoCell
      label={label}
      value={
        <button
          type="button"
          onClick={onClick}
          className="text-start font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={ariaLabel}
        >
          {value}
        </button>
      }
    />
  );
}

export function Opportunity360PlainCell({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const display =
    value == null || value === "" || (typeof value === "string" && !value.trim())
      ? emptyDisplayValue(t)
      : value;
  return <OverviewInfoCell label={label} value={display} className={className} />;
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function Opportunity360EditableTextCell({
  label,
  value,
  disabled,
  onSave,
  className,
}: {
  label: string;
  value: string | null | undefined;
  disabled?: boolean;
  onSave: (next: string) => void;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState(value?.trim() ?? "");

  useEffect(() => {
    setDraft(value?.trim() ?? "");
  }, [value]);

  if (disabled) {
    return <Opportunity360PlainCell label={label} value={value} className={className} />;
  }

  return (
    <OverviewInfoCell
      label={label}
      className={className}
      value={
        <Input
          className="h-8 text-[13px] font-semibold"
          value={draft}
          placeholder={emptyDisplayValue(t)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const next = draft.trim();
            const current = value?.trim() ?? "";
            if (next === current) return;
            onSave(next);
          }}
        />
      }
    />
  );
}

export function Opportunity360EditableAmountCell({
  label,
  value,
  currency,
  disabled,
  onSave,
  className,
}: {
  label: string;
  value: number | null | undefined;
  currency: string | null | undefined;
  disabled?: boolean;
  onSave: (next: number) => void;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const currencyCode = currency?.trim().toUpperCase() ?? "";

  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  if (disabled) {
    return (
      <Opportunity360PlainCell
        label={label}
        value={formatOpportunityMoney(value, currency) || null}
        className={className}
      />
    );
  }

  return (
    <OverviewInfoCell
      label={label}
      className={className}
      value={
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            className="h-8 text-[13px] font-semibold tabular-nums"
            value={draft}
            placeholder={emptyDisplayValue(t)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              const next = Number(draft);
              if (Number.isNaN(next) || next === value) return;
              onSave(next);
            }}
          />
          {currencyCode ? (
            <span className="text-[12px] font-medium text-muted-foreground">{currencyCode}</span>
          ) : null}
        </div>
      }
    />
  );
}

export function Opportunity360EditableNumberCell({
  label,
  value,
  disabled,
  onSave,
  className,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number | null | undefined;
  disabled?: boolean;
  onSave: (next: number) => void;
  className?: string;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState(value != null ? String(value) : "");

  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  if (disabled) {
    const display = value != null ? `${value}${suffix ?? ""}` : null;
    return <Opportunity360PlainCell label={label} value={display} className={className} />;
  }

  return (
    <OverviewInfoCell
      label={label}
      className={className}
      value={
        <div className="flex items-center gap-1">
          <Input
            type="number"
            className="h-8 text-[13px] font-semibold tabular-nums"
            value={draft}
            min={min}
            max={max}
            placeholder={emptyDisplayValue(t)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              const next = Number(draft);
              if (Number.isNaN(next) || next === value) return;
              if (min != null && next < min) return;
              if (max != null && next > max) return;
              onSave(next);
            }}
          />
          {suffix ? <span className="text-[13px] text-muted-foreground">{suffix}</span> : null}
        </div>
      }
    />
  );
}

export function Opportunity360EditableDateCell({
  label,
  value,
  disabled,
  onSave,
  className,
  locale,
}: {
  label: string;
  value: string | null | undefined;
  disabled?: boolean;
  onSave: (next: string | null) => void;
  className?: string;
  locale: string;
}) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState(toDateInputValue(value));

  useEffect(() => {
    setDraft(toDateInputValue(value));
  }, [value]);

  if (disabled) {
    return (
      <Opportunity360PlainCell
        label={label}
        value={formatOpportunityDate(value, locale) || null}
        className={className}
      />
    );
  }

  return (
    <OverviewInfoCell
      label={label}
      className={className}
      value={
        <Input
          type="date"
          className="h-8 text-[13px] font-semibold"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const current = toDateInputValue(value);
            if (draft === current) return;
            onSave(draft ? new Date(`${draft}T12:00:00.000Z`).toISOString() : null);
          }}
        />
      }
    />
  );
}

export function Opportunity360Skeleton() {
  const { t } = useTranslation("common");
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label={t("opportunities360.loading")}>
      <div className="shrink-0 border-b border-border/60 px-5 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-2/5 max-w-sm" />
            <Skeleton className="h-4 w-3/5 max-w-md" />
            <div className="flex gap-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-32" />
            </div>
          </div>
          <Skeleton className="size-9 shrink-0 rounded-md" />
        </div>
      </div>
      <Skeleton className="mx-5 mt-3 h-10 w-full max-w-xl sm:mx-7" />
      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden">
        <div className="min-h-0 flex-1 space-y-4 px-5 py-5 sm:px-7">
          <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <aside className="hidden w-[280px] shrink-0 border-s border-border/60 bg-muted/10 p-4 lg:block">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function Opportunity360SummaryStrip({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-20 min-w-[140px] shrink-0 rounded-xl" />
      ))}
    </div>
  );
}
