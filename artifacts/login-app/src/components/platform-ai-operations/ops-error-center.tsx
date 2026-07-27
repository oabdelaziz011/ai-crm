import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import type { PlatformAiOpsErrorGroup } from "@/lib/platform-ai-operations";
import { maskSecret } from "@/lib/platform-ai-operations";

type OpsErrorCenterProps = {
  errors: PlatformAiOpsErrorGroup[];
  loading?: boolean;
};

export function OpsErrorCenter({ errors, loading }: OpsErrorCenterProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="text-sm font-semibold">{t("platformAiOps.errors.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("platformAiOps.errors.subtitle")}</p>
      </div>
      {loading ? (
        <DashboardTableSkeleton rows={6} />
      ) : errors.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("platformAiOps.errors.empty")}</p>
      ) : (
        <div className="max-h-[480px] divide-y divide-border/40 overflow-auto">
          {errors.map((group) => (
            <div key={`${group.error_code}-${group.source_layer}`} className="space-y-2 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{group.source_layer}</Badge>
                <span className="font-mono text-xs text-destructive">{group.error_code}</span>
                <span className="text-xs text-muted-foreground">
                  {group.occurrences}× · {group.affected_companies} {t("platformAiOps.errors.companies")}
                </span>
              </div>
              <p className="text-sm">{group.human_message}</p>
              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                <span>{t("platformAiOps.errors.firstSeen")}: {format(new Date(group.first_seen), "MMM d HH:mm")}</span>
                <span>{t("platformAiOps.errors.lastSeen")}: {format(new Date(group.last_seen), "MMM d HH:mm")}</span>
                {group.sample_correlation_id && (
                  <span>{t("platformAiOps.errors.correlation")}: {maskSecret(group.sample_correlation_id)}</span>
                )}
              </div>
              {group.sample_stack && (
                <pre className="max-h-24 overflow-auto rounded-md bg-muted/30 p-2 text-[10px] text-muted-foreground">
                  {group.sample_stack.slice(0, 400)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
