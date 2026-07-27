import { useMemo } from "react";
import { format } from "date-fns";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CustomerProfileContext } from "@/components/customer-profile/types";
import {
  WorkspaceEmptyState,
  WorkspaceListRow,
  WorkspacePanel,
  WorkspaceSkeleton,
} from "@/components/customer-workspace/workspace-ui";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { useHasPermission } from "@/hooks/use-rbac";
import type { Customer } from "@/lib/types";

type Props = {
  customer: Customer;
  context?: CustomerProfileContext;
};

export function WorkspaceHistoryTab({ customer }: Props) {
  const { t } = useTranslation("common");
  const canViewAudit = useHasPermission("audit_logs.view");
  const { data: auditLogs = [], isLoading } = useAuditLogs(canViewAudit);

  const customerLogs = useMemo(
    () =>
      auditLogs.filter(
        (log) =>
          (log.entity === "customers" && log.entity_id === customer.id)
          || log.metadata?.customer_id === customer.id,
      ).slice(0, 50),
    [auditLogs, customer.id],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <WorkspacePanel title={t("dashboard.customerWorkspace.history.auditTitle")}>
        {!canViewAudit ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.customerWorkspace.history.noPermission")}</p>
        ) : isLoading ? (
          <WorkspaceSkeleton rows={5} />
        ) : customerLogs.length === 0 ? (
          <WorkspaceEmptyState
            icon={History}
            title={t("dashboard.customerWorkspace.history.emptyTitle")}
            description={t("dashboard.customerWorkspace.history.emptyDescription")}
          />
        ) : (
          <div className="space-y-2">
            {customerLogs.map((log) => (
              <WorkspaceListRow
                key={log.id}
                title={`${log.action} · ${log.entity}`}
                subtitle={format(new Date(log.created_at), "MMM d, yyyy · h:mm a")}
                badge={log.entityDisplayName ?? undefined}
              />
            ))}
          </div>
        )}
      </WorkspacePanel>
    </div>
  );
}
