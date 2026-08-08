import { Check, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandProgressRing } from "@/components/company-workspace/overview/overview-ui";
import { cn } from "@/lib/utils";
import type { CompanySetupProgress } from "@/lib/company-workspace/company-setup-progress";

type Props = {
  progress: CompanySetupProgress;
  onOpenItem: (item: CompanySetupProgress["items"][number]) => void;
};

export function CompanySetupProgressCard({ progress, onOpenItem }: Props) {
  const { t } = useTranslation("common");
  const tone =
    progress.percent >= 85 ? "ok" : progress.percent >= 50 ? "neutral" : "high";

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <BrandProgressRing value={progress.percent} tone={tone} size={104} stroke={9}>
            <span className="text-2xl font-semibold tabular-nums">{progress.percent}%</span>
          </BrandProgressRing>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("companyWorkspace.overview.setup.percentLabel")}
          </p>
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              {t("companyWorkspace.overview.setup.title")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("companyWorkspace.overview.setup.subtitle", {
                completed: progress.completedCount,
                total: progress.totalCount,
              })}
            </p>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300",
                  progress.percent >= 85
                    ? "bg-emerald-500"
                    : progress.percent >= 50
                      ? "bg-primary"
                      : "bg-amber-500",
                )}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SetupList
              title={t("companyWorkspace.overview.setup.completed")}
              items={progress.completed}
              complete
              onOpenItem={onOpenItem}
            />
            <SetupList
              title={t("companyWorkspace.overview.setup.remaining")}
              items={progress.remaining}
              complete={false}
              onOpenItem={onOpenItem}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function SetupList({
  title,
  items,
  complete,
  onOpenItem,
}: {
  title: string;
  items: CompanySetupProgress["items"];
  complete: boolean;
  onOpenItem: (item: CompanySetupProgress["items"][number]) => void;
}) {
  const { t } = useTranslation("common");

  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <p className="text-xs text-muted-foreground">
          {complete
            ? t("companyWorkspace.overview.setup.noneCompleted")
            : t("companyWorkspace.overview.setup.allDone")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item) => {
          const label = t(`companyWorkspace.overview.setup.items.${item.id}`);
          if (complete) {
            return (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-foreground"
              >
                <Check className="size-3.5 shrink-0 text-emerald-500" aria-hidden />
                <span>{label}</span>
              </li>
            );
          }
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpenItem(item)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs text-foreground transition-colors hover:bg-primary/5"
              >
                <Circle className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="underline-offset-2 hover:underline">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
