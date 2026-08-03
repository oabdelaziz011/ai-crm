import type { OperationsCustomerWorkspaceData } from "@workspace/universal-operations-engine";
import { WorkspaceMetric, WorkspacePanel } from "@/components/customer-workspace/workspace-ui";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export function PanelOverviewTab({ data }: { data: OperationsCustomerWorkspaceData }) {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-gradient-to-br from-primary/10 to-card p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("universalOperations.panel.overview.customerCard")}
        </p>
        <p className="mt-1 text-lg font-bold">{data.customer.name}</p>
        <p className="text-xs text-muted-foreground">{data.customer.phone} · {data.customer.email}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.customer.tags.map((tag) => (
            <span key={tag} className="rounded bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase">{tag}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <WorkspaceMetric label={t("universalOperations.panel.overview.status")} value={data.currentStatus} compact />
        <WorkspaceMetric label={t("universalOperations.panel.overview.payment")} value={data.currentPaymentStatus} compact />
        <WorkspaceMetric label={t("universalOperations.panel.overview.resource")} value={data.assignedResource ?? "—"} compact />
        <WorkspaceMetric label={t("universalOperations.panel.overview.priority")} value={data.priority} compact />
      </div>

      <WorkspacePanel title={t("universalOperations.panel.overview.quickActions")} dense>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled>{t("universalOperations.panel.actions.call")}</Button>
          <Button size="sm" variant="outline" disabled>{t("universalOperations.panel.actions.checkIn")}</Button>
          <Button size="sm" variant="outline" disabled>{t("universalOperations.panel.actions.collect")}</Button>
          <Button size="sm" variant="outline" disabled>{t("universalOperations.panel.actions.note")}</Button>
        </div>
      </WorkspacePanel>
    </div>
  );
}
