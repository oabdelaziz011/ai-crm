import { formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { useBrandLastUpdated } from "@/hooks/company-workspace/use-brand-last-updated";
import { cn } from "@/lib/utils";

type Props = {
  companyId: string | null;
  className?: string;
};

export function BrandLastUpdatedCard({ companyId, className }: Props) {
  const { t, i18n } = useTranslation("common");
  const { data, isLoading, isError } = useBrandLastUpdated(companyId, Boolean(companyId));
  const base = "companyWorkspace.brandCenter.lastUpdated";

  if (isLoading || isError || !data) return null;

  const locale = i18n.language.startsWith("ar") ? ar : enUS;
  const relative = formatDistanceToNow(new Date(data.updatedAt), {
    addSuffix: true,
    locale,
  });

  return (
    <section
      className={cn(
        "space-y-2 rounded-2xl border border-border/60 bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div>
        <h2 className="text-sm font-semibold">{t(`${base}.title`)}</h2>
        <p className="text-xs text-muted-foreground">{relative}</p>
      </div>
      {data.actorName ? (
        <p className="text-xs">
          <span className="text-muted-foreground">{t(`${base}.by`)} </span>
          <span className="font-medium text-foreground">{data.actorName}</span>
        </p>
      ) : null}
      {data.fieldKeys.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t(`${base}.updated`)}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {data.fieldKeys.map((key) => (
              <li
                key={key}
                className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-foreground"
              >
                {t(`companyWorkspace.brandCenter.health.items.${key}`, {
                  defaultValue: key,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
