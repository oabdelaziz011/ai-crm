import {
  Building2,
  Download,
  Layers,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  selectedCount: number;
  onClear: () => void;
  onAssignBranch: () => void;
  onAssignDepartment: () => void;
  onChangeRole: () => void;
  onSuspend: () => void;
  onActivate: () => void;
  onExport: () => void;
  onDelete: () => void;
  canManage: boolean;
  className?: string;
};

export function EmployeeBulkToolbar({
  selectedCount,
  onClear,
  onAssignBranch,
  onAssignDepartment,
  onChangeRole,
  onSuspend,
  onActivate,
  onExport,
  onDelete,
  canManage,
  className,
}: Props) {
  const { t } = useTranslation("common");
  if (selectedCount <= 0) return null;

  return (
    <div
      role="toolbar"
      aria-label={t("companyWorkspace.employees.bulk.toolbarLabel")}
      className={cn(
        "sticky bottom-4 z-30 mx-auto flex max-w-5xl flex-wrap items-center gap-1.5 rounded-xl border border-primary/30",
        "bg-background/95 px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
    >
      <span className="px-2 text-sm font-medium tabular-nums">
        {t("companyWorkspace.employees.bulk.selected", { count: selectedCount })}
      </span>
      <div className="mx-1 h-4 w-px bg-border" />
      {canManage ? (
        <>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onAssignBranch}>
            <Building2 className="size-3.5" />
            <span className="hidden sm:inline">{t("companyWorkspace.employees.bulk.assignBranch")}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onAssignDepartment}
          >
            <Layers className="size-3.5" />
            <span className="hidden sm:inline">
              {t("companyWorkspace.employees.bulk.assignDepartment")}
            </span>
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onChangeRole}>
            <Shield className="size-3.5" />
            <span className="hidden sm:inline">{t("companyWorkspace.employees.bulk.changeRole")}</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onSuspend}>
            <UserX className="size-3.5" />
            <span className="hidden sm:inline">{t("companyWorkspace.employees.bulk.suspend")}</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onActivate}>
            <UserCheck className="size-3.5" />
            <span className="hidden sm:inline">{t("companyWorkspace.employees.bulk.activate")}</span>
          </Button>
        </>
      ) : null}
      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onExport}>
        <Download className="size-3.5" />
        <span className="hidden sm:inline">{t("companyWorkspace.actions.export")}</span>
      </Button>
      {canManage ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          <span className="hidden sm:inline">{t("buttons.delete")}</span>
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ms-auto h-8 w-8 p-0"
        onClick={onClear}
        aria-label={t("companyWorkspace.employees.bulk.clear")}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
