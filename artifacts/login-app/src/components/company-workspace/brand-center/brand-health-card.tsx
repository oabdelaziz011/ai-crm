import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandHealthStatusBadge } from "@/components/company-workspace/brand-center/brand-health-status-badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  computeBrandHealth,
  type BrandHealthItem,
  type BrandHealthTarget,
} from "@/lib/company-workspace/brand-center/brand-health";
import type { CompanyBrandCenterDocument } from "@/lib/company-workspace/brand-center/types";
import { cn } from "@/lib/utils";

type Props = {
  document: CompanyBrandCenterDocument;
  onNavigate: (target: BrandHealthTarget) => void;
  className?: string;
};

export function BrandHealthCard({ document, onNavigate, className }: Props) {
  const { t } = useTranslation("common");
  const report = computeBrandHealth(document);
  const base = "companyWorkspace.brandCenter.health";
  const incomplete = report.items.filter((i) => i.status !== "ready");
  const missing = incomplete.filter((i) => i.status === "required_missing");
  const optional = incomplete.filter((i) => i.status === "optional_missing");
  const fallback = incomplete.filter((i) => i.status === "fallback");

  return (
    <section
      className={cn(
        "space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t(`${base}.title`)}</h2>
          <p className="text-xs text-muted-foreground">{t(`${base}.subtitle`)}</p>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto rounded-xl bg-primary/10 px-3 py-1.5 text-center hover:bg-primary/15"
              aria-label={t(`${base}.scoreDetailsAria`, { score: report.score })}
            >
              <span className="block text-lg font-semibold tabular-nums text-primary">
                {report.score}%
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t(`${base}.score`)}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-3 p-4" sideOffset={8}>
            <div>
              <p className="text-sm font-semibold">{t(`${base}.title`)}</p>
              <p className="text-2xl font-semibold tabular-nums text-primary">
                {report.score}%
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(`${base}.completedCount`, {
                done: report.completed,
                total: report.items.length,
              })}
            </p>
            <ScoreGroup
              title={t(`${base}.groups.missing`)}
              items={missing}
              emptyLabel={t(`${base}.groups.noneMissing`)}
              onNavigate={onNavigate}
            />
            <ScoreGroup
              title={t(`${base}.groups.optional`)}
              items={optional}
              emptyLabel={t(`${base}.groups.noneOptional`)}
              onNavigate={onNavigate}
            />
            <ScoreGroup
              title={t(`${base}.groups.fallback`)}
              items={fallback}
              emptyLabel={t(`${base}.groups.noneFallback`)}
              onNavigate={onNavigate}
            />
          </PopoverContent>
        </Popover>
      </div>

      <ul className="space-y-1.5">
        {report.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onNavigate(item.target)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-start text-sm",
                "transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {t(`${base}.items.${item.labelKey}`)}
                </span>
                {item.status === "fallback" && item.fallbackKey ? (
                  <span className="block text-[11px] text-sky-700 dark:text-sky-400">
                    {t(`${base}.fallbacks.${item.fallbackKey}`)}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <BrandHealthStatusBadge status={item.status} />
                <ChevronRight className="size-3.5 text-muted-foreground rtl:rotate-180" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScoreGroup({
  title,
  items,
  emptyLabel,
  onNavigate,
}: {
  title: string;
  items: BrandHealthItem[];
  emptyLabel: string;
  onNavigate: (target: BrandHealthTarget) => void;
}) {
  const { t } = useTranslation("common");
  const base = "companyWorkspace.brandCenter.health";

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-start text-xs hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onNavigate(item.target)}
              >
                <span className="truncate">
                  ○ {t(`${base}.items.${item.labelKey}`)}
                </span>
                <BrandHealthStatusBadge status={item.status} className="text-[10px]" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
