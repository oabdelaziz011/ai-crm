import { Badge } from "@/components/ui/badge";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";
import type { WorkflowDocument } from "../../core/types";

export function WorkflowStatusBadge({
  status,
  hasUnpublishedDraft,
}: {
  status: WorkflowDocument["status"];
  hasUnpublishedDraft?: boolean;
}) {
  const { lifecycleLabel } = useWorkflowBuilderI18n();
  const label = lifecycleLabel(status, hasUnpublishedDraft);
  const tone =
    status === "active"
      ? hasUnpublishedDraft
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "archived" || status === "disabled"
        ? "bg-slate-500/15 text-slate-700 dark:text-slate-200"
        : "bg-sky-500/15 text-sky-700 dark:text-sky-300";

  return (
    <Badge variant="outline" className={`rounded-full border-transparent px-3 py-1 ${tone}`}>
      {label}
    </Badge>
  );
}
