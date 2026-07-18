import { useTranslation } from "react-i18next";
import type { AuditStatus } from "@/lib/audit-log/constants";

const STATUS_CLASSES: Record<AuditStatus, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-400",
};

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  const { t } = useTranslation("common");

  return (
    <span className={`inline-flex items-center whitespace-nowrap text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_CLASSES[status]}`}>
      {t(`auditLogs.statuses.${status}`)}
    </span>
  );
}
