import { useMemo } from "react";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CustomerProfileContext } from "@/components/customer-profile/types";
import { WorkspaceSkeleton } from "@/components/customer-workspace/workspace-ui";
import {
  WorkspaceInlineEmpty,
  WorkspaceTabFrame,
} from "@/components/customer-workspace/workspace-tab-frame";
import { fmtDateTime } from "@/lib/customer-workspace/customer-workspace-utils";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { useHasPermission } from "@/hooks/use-rbac";
import type { Customer } from "@/lib/types";

type Props = {
  customer: Customer;
  context?: CustomerProfileContext;
};

export function WorkspaceHistoryTab({ customer }: Props) {
  const { t, i18n } = useTranslation("common");
  const canViewAudit = useHasPermission("audit_logs.view");
  const { data: auditLogs = [], isLoading } = useAuditLogs(canViewAudit);

  const customerLogs = useMemo(
    () =>
      auditLogs
        .filter(
          (log) =>
            (log.entity === "customers" && log.entity_id === customer.id) ||
            log.metadata?.customer_id === customer.id,
        )
        .slice(0, 50),
    [auditLogs, customer.id],
  );

  if (isLoading) return <WorkspaceSkeleton rows={5} />;

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.history.auditTitle")}
      subtitle={t("dashboard.customers.list.rowCount", { count: customerLogs.length })}
    >
      {!canViewAudit ? (
        <WorkspaceInlineEmpty
          icon={History}
          title={t("dashboard.customerWorkspace.history.noPermission")}
          description={t("dashboard.customerWorkspace.history.emptyDescription")}
        />
      ) : customerLogs.length === 0 ? (
        <WorkspaceInlineEmpty
          icon={History}
          title={t("dashboard.customerWorkspace.history.emptyTitle")}
          description={t("dashboard.customerWorkspace.history.emptyDescription")}
        />
      ) : (
        <table className="w-full min-w-[36rem] table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5 text-start">{t("dashboard.customerWorkspace.history.colAction")}</th>
              <th className="w-[22%] px-3 py-2.5 text-start">{t("dashboard.customerWorkspace.history.colActor")}</th>
              <th className="w-[22%] px-3 py-2.5 text-start">{t("dashboard.customerWorkspace.history.colEntity")}</th>
              <th className="w-[24%] px-3 py-2.5 text-start">{t("dashboard.customerWorkspace.history.colWhen")}</th>
            </tr>
          </thead>
          <tbody>
            {customerLogs.map((log) => (
              <tr key={log.id} className="border-b border-border/40 hover:bg-primary/5">
                <td className="px-3 py-2.5 font-medium">{log.action}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {log.profile?.full_name ??
                    log.profile?.email ??
                    t("dashboard.customerProfile.timeline.systemActor")}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {log.entityDisplayName ?? log.entity}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                  {fmtDateTime(log.created_at, i18n.language)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WorkspaceTabFrame>
  );
}
