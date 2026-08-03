import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";
import { useLeadsQueue } from "@/hooks/leads/use-leads-workspace";
import { Lead360Workspace } from "@/components/leads/lead360/lead360-workspace";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

function ScoreBadge({ band }: { band: LeadWorkspaceRow["scoreBand"] }) {
  const { t } = useTranslation("common");
  const variant = band === "hot" ? "destructive" : band === "warm" ? "default" : "secondary";
  return <Badge variant={variant}>{t(`leads.scoreBand.${band}`)}</Badge>;
}

export function LeadsTablePage() {
  const { t } = useTranslation("common");
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<LeadWorkspaceRow | null>(null);
  const { data, isLoading } = useLeadsQueue({ search: search || undefined, limit: 100 });

  const rows = useMemo(() => data?.rows ?? [], [data]);

  if (isLoading) return <DashboardPageFallback />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{t("leads.table.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("leads.table.subtitle")}</p>
      </div>

      <Input
        placeholder={t("leads.table.search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      <div className="overflow-hidden rounded-xl border border-border/60">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">{t("leads.columns.lead")}</th>
              <th className="px-4 py-3 font-medium">{t("leads.columns.stage")}</th>
              <th className="px-4 py-3 font-medium">{t("leads.columns.score")}</th>
              <th className="px-4 py-3 font-medium">{t("leads.columns.value")}</th>
              <th className="px-4 py-3 font-medium">{t("leads.columns.owner")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-border/40 hover:bg-muted/20"
                onClick={() => setSelectedLead(row)}
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{row.title}</div>
                  <div className="text-xs text-muted-foreground">{row.companyName ?? row.email ?? row.phone}</div>
                </td>
                <td className="px-4 py-3 capitalize">{row.stageName}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span>{row.score}</span>
                    <ScoreBadge band={row.scoreBand} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  {row.estimatedValue != null ? `${row.currency} ${row.estimatedValue.toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3">{row.ownerName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-muted-foreground">{t("leads.table.empty")}</div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        {t("leads.table.count", { shown: rows.length, total: data?.total ?? 0 })}
      </div>

      <Lead360Workspace leadId={selectedLead?.id ?? null} open={Boolean(selectedLead)} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
