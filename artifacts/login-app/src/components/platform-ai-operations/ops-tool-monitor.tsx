import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import type { PlatformAiOpsToolStat } from "@/lib/platform-ai-operations";

type OpsToolMonitorProps = {
  tools: PlatformAiOpsToolStat[];
  loading?: boolean;
};

export function OpsToolMonitor({ tools, loading }: OpsToolMonitorProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="text-sm font-semibold">{t("platformAiOps.tools.title")}</h3>
      </div>
      {loading ? (
        <DashboardTableSkeleton rows={6} />
      ) : tools.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("platformAiOps.tools.empty")}</p>
      ) : (
        <div className="divide-y divide-border/40">
          {tools.map((tool) => (
            <div key={tool.tool_name} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <div>
                <p className="font-medium font-mono text-xs">{tool.tool_name}</p>
                <p className="text-xs text-muted-foreground">
                  {tool.success_count} ok · {tool.failure_count} fail · {tool.avg_duration_ms}ms avg
                </p>
              </div>
              <div className="text-end">
                <p className="font-semibold">{tool.call_count}</p>
                <p className="text-xs text-muted-foreground">{tool.error_rate}% err</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
