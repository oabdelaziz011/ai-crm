import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import type { PlatformAiOpsAuditRow } from "@/lib/platform-ai-operations";

type OpsAuditLogProps = {
  rows: PlatformAiOpsAuditRow[];
  loading?: boolean;
};

export function OpsAuditLog({ rows, loading }: OpsAuditLogProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="text-sm font-semibold">{t("platformAiOps.audit.title")}</h3>
      </div>
      {loading ? (
        <DashboardTableSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("platformAiOps.audit.empty")}</p>
      ) : (
        <div className="max-h-[360px] divide-y divide-border/40 overflow-auto">
          {rows.map((row) => (
            <div key={row.id} className="px-5 py-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{row.action}</span>
                <span className="text-muted-foreground">{format(new Date(row.created_at), "MMM d HH:mm")}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{row.entity}</p>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
