import { useMemo, useState } from "react";
import { ChevronLeft, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  REPORT_CATEGORY_ORDER,
  REPORT_CATEGORY_TITLE_KEYS,
  type ReportCategoryId,
  type ReportDefinition,
} from "@/lib/reports/report-catalog";

export function ReportsDiscovery({
  available,
  selectedId,
  onSelect,
  compact = false,
}: {
  available: ReportDefinition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** When true, show category tiles first (center above-the-fold). */
  compact?: boolean;
}) {
  const { t } = useTranslation("common");
  const [query, setQuery] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<ReportCategoryId | null>(null);

  const detailReports = useMemo(
    () => available.filter((r) => r.id !== "overview"),
    [available],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return detailReports;
    return detailReports.filter((report) => {
      const title = t(report.titleKey).toLowerCase();
      const desc = t(report.descriptionKey).toLowerCase();
      return title.includes(q) || desc.includes(q) || report.id.includes(q);
    });
  }, [detailReports, query, t]);

  const grouped = useMemo(() => {
    return REPORT_CATEGORY_ORDER.map((category) => ({
      category,
      titleKey: REPORT_CATEGORY_TITLE_KEYS[category],
      reports: filtered.filter((r) => r.category === category),
    })).filter((g) => g.reports.length > 0);
  }, [filtered]);

  return (
    <section className={cn("space-y-3", compact && "space-y-2.5")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground md:text-base">
            {t("dashboard.reports.discoveryTitle", "Available reports")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t(
              "dashboard.reports.discoverySubtitle",
              "Only reports allowed for your role and company modules are listed.",
            )}
          </p>
        </div>
        <div className="relative w-full sm:max-w-[240px]">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("dashboard.reports.searchPlaceholder", "Search reports…")}
            className="h-9 ps-8 text-sm"
            aria-label={t("dashboard.reports.searchPlaceholder", "Search reports…")}
          />
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {t("dashboard.reports.discoveryEmpty", "No reports match your search.")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {grouped.map((group) => {
            const open = expandedCategory === group.category || Boolean(query.trim());
            return (
              <div
                key={group.category}
                className={cn(
                  "rounded-xl border border-border bg-card transition-colors",
                  open && "border-primary/30 bg-primary/[0.03] md:col-span-2 xl:col-span-2",
                )}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 p-3 text-start"
                  onClick={() =>
                    setExpandedCategory((prev) =>
                      prev === group.category ? null : group.category,
                    )
                  }
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {t(group.titleKey)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("dashboard.reports.discoveryCount", {
                        count: group.reports.length,
                        defaultValue: "{{count}} reports",
                      })}
                    </p>
                  </div>
                  <ChevronLeft
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform rtl:rotate-180",
                      open && "-rotate-90 rtl:rotate-90",
                    )}
                  />
                </button>
                {open ? (
                  <ul className="space-y-1 border-t border-border/80 px-2 pb-2 pt-1">
                    {group.reports.map((report) => {
                      const active = selectedId === report.id;
                      return (
                        <li key={report.id}>
                          <button
                            type="button"
                            onClick={() => onSelect(report.id)}
                            className={cn(
                              "w-full rounded-lg px-2.5 py-2 text-start transition-colors",
                              active
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-muted/60",
                            )}
                          >
                            <p className="text-sm font-medium">{t(report.titleKey)}</p>
                            <p className="line-clamp-1 text-[11px] text-muted-foreground">
                              {t(report.descriptionKey)}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
