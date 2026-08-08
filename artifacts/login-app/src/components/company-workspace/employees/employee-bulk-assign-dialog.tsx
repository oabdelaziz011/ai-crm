import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DepartmentSearchableSelect,
  type DepartmentOption,
} from "@/components/users/department-searchable-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useCompanyAssignableRoles } from "@/hooks/use-company-assignable-roles";
import { BranchAssignmentMultiSelect } from "@/lib/company/branches/components";
import { useBranches } from "@/lib/company/branches/hooks";

export type BulkAssignKind = "branch" | "department" | "role";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: BulkAssignKind;
  companyId: string;
  selectedCount: number;
  departments: DepartmentOption[];
  onSubmit: (payload: {
    branchIds?: string[];
    department?: string | null;
    roleId?: string;
  }) => Promise<void> | void;
  isSubmitting?: boolean;
};

export function EmployeeBulkAssignDialog({
  open,
  onOpenChange,
  kind,
  companyId,
  selectedCount,
  departments,
  onSubmit,
  isSubmitting,
}: Props) {
  const { t } = useTranslation("common");
  const { data: branches = [], isLoading: branchesLoading } = useBranches(companyId);
  const { data: roles = [], isLoading: rolesLoading } = useCompanyAssignableRoles(
    companyId,
    open && kind === "role",
  );

  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [department, setDepartment] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tenantRoles = useMemo(
    () => roles.filter((r) => r.company_id === companyId),
    [roles, companyId],
  );

  useEffect(() => {
    if (!open) return;
    setBranchIds([]);
    setDepartment("");
    setRoleId("");
    setError(null);
  }, [open, kind]);

  const title =
    kind === "branch"
      ? t("companyWorkspace.employees.bulk.assignBranchTitle")
      : kind === "department"
        ? t("companyWorkspace.employees.bulk.assignDepartmentTitle")
        : t("companyWorkspace.employees.bulk.changeRoleTitle");

  const handleSubmit = async () => {
    setError(null);
    if (kind === "branch") {
      if (branchIds.length === 0) {
        setError(t("companyWorkspace.employees.bulk.branchRequired"));
        return;
      }
      await onSubmit({ branchIds });
      return;
    }
    if (kind === "department") {
      await onSubmit({ department: department.trim() || null });
      return;
    }
    if (!roleId) {
      setError(t("companyWorkspace.employees.bulk.roleRequired"));
      return;
    }
    await onSubmit({ roleId });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/60 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t("companyWorkspace.employees.bulk.applyToSelected", { count: selectedCount })}
          </p>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {kind === "branch" ? (
            <BranchAssignmentMultiSelect
              label={t("companyWorkspace.employees.columns.branch")}
              branches={branches}
              selectedIds={branchIds}
              onChange={setBranchIds}
              isLoading={branchesLoading}
            />
          ) : null}

          {kind === "department" ? (
            <DepartmentSearchableSelect
              companyId={companyId}
              value={department}
              onChange={setDepartment}
              departments={departments}
            />
          ) : null}

          {kind === "role" ? (
            <SearchableSelect
              value={roleId}
              onValueChange={setRoleId}
              options={tenantRoles.map((r) => ({
                value: r.id,
                label: r.name ?? t("users.noRole"),
                description: r.description ?? undefined,
              }))}
              placeholder={t("users.form.rolePlaceholder")}
              searchPlaceholder={t("users.form.roleSearchPlaceholder")}
              emptyLabel={t("users.form.noRolesAvailable")}
              disabled={rolesLoading}
            />
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("buttons.cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : t("buttons.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
