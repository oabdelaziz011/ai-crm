import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";
import {
  useAutomationExecutionHistory,
  useAutomationHistory,
} from "@/hooks/automation/use-automation-workflows";

export function AutomationCenterHistoryPage() {
  const { t } = useTranslation("common");
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const [page, setPage] = useState(1);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);

  const { data, isLoading } = useAutomationHistory(companyId, page);
  const { data: steps = [] } = useAutomationExecutionHistory(selectedExecutionId);

  return (
    <div className="space-y-6">
      <DashboardCard className="p-6 space-y-4">
        <h3 className="font-semibold">{t("automation.center.history.title")}</h3>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("automation.center.loading")}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">{t("automation.center.history.event")}</th>
                    <th className="py-2 pr-4">{t("automation.center.history.status")}</th>
                    <th className="py-2 pr-4">{t("automation.center.history.started")}</th>
                    <th className="py-2">{t("automation.center.history.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.items ?? []).map((execution) => (
                    <tr key={execution.id} className="border-b border-border/40">
                      <td className="py-2 pr-4">{execution.triggerEvent}</td>
                      <td className="py-2 pr-4">{execution.status}</td>
                      <td className="py-2 pr-4">{new Date(execution.createdAt).toLocaleString()}</td>
                      <td className="py-2">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedExecutionId(execution.id)}>
                          {t("automation.center.history.viewSteps")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t("notifications.pagination.previous")}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("notifications.pagination.pageInfo", {
                  page,
                  totalPages: Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20))),
                  total: data?.total ?? 0,
                })}
              </span>
              <Button size="sm" variant="outline" disabled={!data?.hasMore} onClick={() => setPage((p) => p + 1)}>
                {t("notifications.pagination.next")}
              </Button>
            </div>
          </>
        )}
      </DashboardCard>

      {selectedExecutionId ? (
        <DashboardCard className="p-6 space-y-3">
          <h3 className="font-semibold">{t("automation.center.history.steps")}</h3>
          <ul className="space-y-2 text-sm">
            {steps.map((step) => (
              <li key={step.id} className="rounded-lg border border-border/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{step.stepType}</span>
                  <span className="text-muted-foreground">{step.status}</span>
                </div>
                {step.error ? <p className="mt-1 text-xs text-rose-400">{step.error}</p> : null}
              </li>
            ))}
          </ul>
        </DashboardCard>
      ) : null}
    </div>
  );
}
