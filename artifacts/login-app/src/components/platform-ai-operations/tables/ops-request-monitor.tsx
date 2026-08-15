import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlatformAiOpsRequestRow } from "@/lib/platform-ai-operations";
import { opsStatusLabel } from "../ops-status-label";

type OpsRequestMonitorProps = {
  rows: PlatformAiOpsRequestRow[];
  loading?: boolean;
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("common");
  const normalized = status.toLowerCase();
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px]",
        normalized === "succeeded" || normalized === "completed"
          ? "border-emerald-500/30 text-emerald-400"
          : normalized === "failed"
            ? "border-red-500/30 text-red-400"
            : "border-amber-500/30 text-amber-400",
      )}
    >
      {opsStatusLabel(t, status)}
    </Badge>
  );
}

export function OpsRequestMonitor({ rows, loading }: OpsRequestMonitorProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="text-sm font-semibold">{t("platformAiOps.requests.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("platformAiOps.requests.subtitle")}</p>
      </div>

      {loading ? (
        <DashboardTableSkeleton rows={8} />
      ) : rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{t("platformAiOps.requests.empty")}</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[960px] text-xs">
            <thead className="sticky top-0 bg-card/95 backdrop-blur">
              <tr className="border-b border-border/60 text-muted-foreground">
                {[
                  "time",
                  "company",
                  "module",
                  "model",
                  "tokens",
                  "latency",
                  "cost",
                  "result",
                ].map((col) => (
                  <th key={col} className="px-3 py-2 text-start font-medium">
                    {t(`platformAiOps.requests.columns.${col}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                    {format(new Date(row.recorded_at), "HH:mm:ss")}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{row.company_name}</td>
                  <td className="px-3 py-2.5">
                    {!row.module || row.module.toLowerCase() === "unknown"
                      ? t("platformAiOps.moduleUnknown")
                      : row.module}
                  </td>
                  <td className="px-3 py-2.5">{row.model}</td>
                  <td className="px-3 py-2.5">{row.total_tokens.toLocaleString()}</td>
                  <td className="px-3 py-2.5">{row.latency_ms}ms</td>
                  <td className="px-3 py-2.5">${Number(row.estimated_cost).toFixed(4)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={row.result_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  );
}
