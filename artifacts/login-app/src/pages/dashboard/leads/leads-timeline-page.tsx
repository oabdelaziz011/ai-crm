import { useTranslation } from "react-i18next";
import { useLeadsQueue } from "@/hooks/leads/use-leads-workspace";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
export function LeadsTimelinePage() {
  const { t } = useTranslation("common");
  const { data, isLoading } = useLeadsQueue({ limit: 50 });

  if (isLoading) return <DashboardPageFallback />;

  const rows = [...(data?.rows ?? [])].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{t("leads.timeline.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("leads.timeline.subtitle")}</p>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-border/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">{row.name}</div>
                <div className="text-sm text-muted-foreground capitalize">{row.stage}</div>
              </div>
              <div className="text-xs text-muted-foreground">{new Date(row.updatedAt).toLocaleString()}</div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-10 text-center text-muted-foreground">{t("leads.timeline.empty")}</div>
        )}
      </div>
    </div>
  );
}
