import { useTranslation } from "react-i18next";
import type { AuditOperation } from "@/lib/audit-log/constants";
import { getOperationCategory } from "@/lib/audit-log/mapping";

const CATEGORY_CLASSES: Record<
  ReturnType<typeof getOperationCategory>,
  string
> = {
  create: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  update: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  delete: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  auth: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  system: "border-violet-500/30 bg-violet-500/10 text-violet-400",
};

export function AuditOperationBadge({ operation }: { operation: AuditOperation }) {
  const { t } = useTranslation("common");
  const category = getOperationCategory(operation);

  return (
    <span className={`inline-flex items-center whitespace-nowrap text-xs font-medium px-2.5 py-1 rounded-full border ${CATEGORY_CLASSES[category]}`}>
      {t(`auditLogs.operations.${operation}`)}
    </span>
  );
}
