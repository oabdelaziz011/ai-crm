/**
 * Searchable department picker backed by organization_departments.
 *
 * Value / onChange use organization_departments.id (canonical).
 * Labels may include branch context; never persist by name alone.
 */
import { useMemo } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useOrganizationDepartments } from "@/hooks/organization/use-organization-departments";
import { useBranches } from "@/lib/company/branches/hooks";
import {
  formatDepartmentOptionLabel,
  type DepartmentMembershipOption,
} from "@/lib/organization/department-membership";
import { cn } from "@/lib/utils";

export type DepartmentOption = DepartmentMembershipOption;

type Props = {
  companyId: string;
  /** Canonical organization_departments.id, or empty string for none. */
  value: string;
  onChange: (departmentId: string) => void;
  /** Preloaded departments (avoids a second query when the parent already loaded them). */
  departments?: DepartmentOption[];
  disabled?: boolean;
  className?: string;
  /** Shown when there are no departments — e.g. navigate to create or open a form. */
  onCreateDepartment?: () => void;
};

const NONE_VALUE = "__none__";

export function DepartmentSearchableSelect({
  companyId,
  value,
  onChange,
  departments: provided,
  disabled,
  className,
  onCreateDepartment,
}: Props) {
  const { t } = useTranslation("common");
  const shouldFetch = provided === undefined;
  const { data: fetched = [], isLoading: departmentsLoading } = useOrganizationDepartments(
    shouldFetch ? companyId : null,
    false,
  );
  const needsBranchNames =
    shouldFetch || (provided?.some((d) => d.branchId && !d.branchName) ?? false);
  const { data: branches = [], isLoading: branchesLoading } = useBranches(
    needsBranchNames ? companyId : null,
  );

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const branch of branches) {
      map.set(branch.id, branch.name);
    }
    return map;
  }, [branches]);

  const departments = useMemo<DepartmentOption[]>(() => {
    const source: DepartmentOption[] = provided
      ? provided
      : fetched
          .filter((d) => d.isActive !== false)
          .map((d) => ({
            id: d.id,
            name: d.name,
            branchId: d.branchId,
            branchName: null,
          }));

    return source.map((d) => ({
      ...d,
      branchName: d.branchName ?? (d.branchId ? branchNameById.get(d.branchId) ?? null : null),
    }));
  }, [provided, fetched, branchNameById]);

  const options = useMemo(() => {
    const sorted = [...departments].sort((a, b) => {
      const labelA = formatDepartmentOptionLabel(a.name, a.branchName);
      const labelB = formatDepartmentOptionLabel(b.name, b.branchName);
      return labelA.localeCompare(labelB);
    });
    return [
      {
        value: NONE_VALUE,
        label: t("users.form.departmentNone"),
      },
      ...sorted.map((d) => ({
        value: d.id,
        label: formatDepartmentOptionLabel(d.name, d.branchName),
      })),
    ];
  }, [departments, t]);

  const selectedValue = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return NONE_VALUE;
    return departments.some((d) => d.id === trimmed) ? trimmed : NONE_VALUE;
  }, [departments, value]);

  const loading =
    (departmentsLoading && shouldFetch) || (branchesLoading && needsBranchNames);

  if (!loading && departments.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-center",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">
          {t("users.form.noDepartmentsFound")}
        </p>
        {onCreateDepartment ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 h-8 gap-1.5"
            disabled={disabled}
            onClick={onCreateDepartment}
          >
            <Plus className="size-3.5" />
            {t("users.form.createDepartment")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <SearchableSelect
      value={selectedValue}
      onValueChange={(next) => onChange(next === NONE_VALUE ? "" : next)}
      options={options}
      placeholder={t("users.form.departmentSelectPlaceholder")}
      searchPlaceholder={t("users.form.departmentSearchPlaceholder")}
      emptyLabel={loading ? t("common.loading") : t("users.form.noDepartmentsFound")}
      disabled={disabled || loading}
      className={className}
    />
  );
}
