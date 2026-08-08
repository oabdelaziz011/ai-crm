import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function fmtShort(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return value;
  }
}

function priorityClass(priority: OperationsRow["priority"]) {
  if (priority === "urgent") return "bg-red-500/15 text-red-700 dark:text-red-400";
  if (priority === "high") return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-muted/50 text-muted-foreground";
}

export function OperationWorkspaceHeader({
  row,
  onClose,
}: {
  row: OperationsRow;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");
  const reference = String(row.values.reference ?? row.id);
  const title = String(row.values.service ?? row.values.customer ?? t("universalOperations.workspace.title"));

  return (
    <header className="shrink-0 border-b border-border/60 bg-background/95 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs font-semibold text-primary">{reference}</p>
            <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              {String(row.values.status ?? "—")}
            </span>
            <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", priorityClass(row.priority))}>
              {row.priority}
            </span>
          </div>
          <h2 className="mt-0.5 truncate text-base font-semibold tracking-tight">{title}</h2>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-4">
            <div>
              <p className="uppercase tracking-wider text-[9px] font-bold">{t("universalOperations.workspace.header.assigned")}</p>
              <p className="truncate text-foreground/90">{String(row.values.resource ?? "—")}</p>
            </div>
            <div>
              <p className="uppercase tracking-wider text-[9px] font-bold">{t("universalOperations.workspace.header.customer")}</p>
              <p className="truncate text-foreground/90">{String(row.values.customer ?? "—")}</p>
            </div>
            <div>
              <p className="uppercase tracking-wider text-[9px] font-bold">{t("universalOperations.workspace.header.created")}</p>
              <p className="truncate text-foreground/90">{fmtShort(row.createdAt)}</p>
            </div>
            <div>
              <p className="uppercase tracking-wider text-[9px] font-bold">{t("universalOperations.workspace.header.updated")}</p>
              <p className="truncate text-foreground/90">{fmtShort(row.updatedAt)}</p>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose} aria-label={t("universalOperations.workspace.close")}>
          <X className="size-4" />
        </Button>
      </div>
    </header>
  );
}
