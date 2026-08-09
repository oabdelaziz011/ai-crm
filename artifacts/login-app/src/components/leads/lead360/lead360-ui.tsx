import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const value = n <= 1 ? n * 100 : n;
  return `${Math.round(value)}%`;
}

export type LeadScoreBandKey = "excellent" | "strong" | "moderate" | "developing";

export function scoreBandKey(score: number | null | undefined): LeadScoreBandKey | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 85) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 50) return "moderate";
  return "developing";
}

/** @deprecated Prefer scoreBandKey + i18n `leads360.scoreBand.*`. */
export function scoreLabel(score: number | null | undefined): string {
  const key = scoreBandKey(score);
  if (!key) return "—";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function localizedScoreBandLabel(
  t: (key: string) => string,
  score: number | null | undefined,
): string {
  const key = scoreBandKey(score);
  if (!key) return "—";
  return t(`leads360.scoreBand.${key}`);
}

export function AiCard({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "animate-in fade-in-0 zoom-in-95 rounded-xl border border-border/50 bg-card/80 p-4 shadow-sm duration-300",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Enterprise overview cell — label on top, value below (RTL-friendly). */
export function OverviewInfoCell({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-card/70 p-4 shadow-sm transition-colors hover:bg-card/90",
        className,
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 min-h-[1.25rem] text-[14px] font-medium leading-snug text-foreground">
        {value ?? "—"}
      </div>
    </div>
  );
}

export function ConfidenceBar({
  label,
  confidence,
  source,
}: {
  label: string;
  confidence: number;
  source?: string | null;
}) {
  const { t } = useTranslation("common");
  const width = Math.max(0, Math.min(100, confidence <= 1 ? confidence * 100 : confidence));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        <span className="text-[12px] tabular-nums text-muted-foreground">{pct(confidence)}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(width)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-foreground/80 transition-[width] duration-500 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
      {source ? (
        <p className="text-[11px] text-muted-foreground">
          {t("leads360.provenance.source")} · {source}
        </p>
      ) : null}
    </div>
  );
}

/** Normalize lead/AI scores that may be 0–1 fractions or 0–100 points. */
export function normalizeLeadScore(score: number | null | undefined): number | null {
  if (score == null || Number.isNaN(score)) return null;
  const scaled = score > 0 && score <= 1 ? score * 100 : score;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

export function ScoreGauge({ score }: { score: number | null | undefined }) {
  const { t } = useTranslation("common");
  const value = normalizeLeadScore(score);
  const width = value == null ? 0 : value;
  const bandLabel = localizedScoreBandLabel(t, value);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[2rem] font-semibold tracking-tight tabular-nums text-foreground">
            {value == null ? "—" : value}
            <span className="ms-1 text-[14px] font-medium text-muted-foreground">/ 100</span>
          </div>
          <div className="mt-1 text-[12px] font-medium text-muted-foreground">{bandLabel}</div>
        </div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-700 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function SignalChip({
  label,
  tone = "buy",
}: {
  label: string;
  tone?: "buy" | "risk";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium",
        tone === "buy" && "border-emerald-600/20 bg-emerald-600/8 text-foreground",
        tone === "risk" && "border-amber-600/25 bg-amber-600/8 text-foreground",
      )}
    >
      <span aria-hidden>{tone === "buy" ? "✓" : "⚠"}</span>
      {label}
    </span>
  );
}

export function ProvenanceLine({
  confidence,
  source,
  updatedAt,
  valueLabel,
}: {
  confidence?: number | null;
  source?: string | null;
  updatedAt?: string | null;
  valueLabel?: string | null;
}) {
  const { t } = useTranslation("common");
  if (confidence == null && !source && !updatedAt && !valueLabel) return null;
  const updatedLabel = formatUpdatedAt(updatedAt);
  return (
    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
      {valueLabel ? (
        <span className="me-2">
          {t("leads360.provenance.value")} · {valueLabel}
        </span>
      ) : null}
      {confidence != null ? (
        <span>
          {t("leads360.provenance.confidence")} {pct(confidence)}
        </span>
      ) : null}
      {confidence != null && source ? " · " : null}
      {source ? (
        <span>
          {t("leads360.provenance.source")} · {source}
        </span>
      ) : null}
      {(confidence != null || source) && updatedLabel ? " · " : null}
      {updatedLabel ? (
        <span>
          {t("leads360.provenance.updated")} · {updatedLabel}
        </span>
      ) : null}
    </p>
  );
}

function formatUpdatedAt(value?: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value;
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function Lead360Skeleton() {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label={t("leads360.loading")}>
      <div className="flex gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-2">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function businessWeekForCountry(countryCode: string | null | undefined): string | null {
  const code = (countryCode ?? "").toUpperCase();
  if (["SA", "AE", "KW", "BH", "QA", "OM", "EG", "JO"].includes(code)) {
    return "Sunday → Thursday";
  }
  if (!code) return null;
  return "Monday → Friday";
}

export function humanizeSignal(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
