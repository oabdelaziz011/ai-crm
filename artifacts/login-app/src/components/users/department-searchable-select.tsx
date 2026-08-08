import { useMemo } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useOrganizationDepartments } from "@/hooks/organization/use-organization-departments";
import { cn } from "@/lib/utils";

export type DepartmentOption = {
  id: string;
  name: string;
};

type Props = {
  companyId: string;
  value: string;
  onChange: (departmentName: string) => void;
  /** Preloaded departments (avoids a second query when the parent already loaded them). */
  departments?: DepartmentOption[];
  disabled?: boolean;
  className?: string;
  /** Shown when there are no departments — e.g. navigate to create or open a form. */
  onCreateDepartment?: () => void;
};

const NONE_VALUE = "__none__";

/**
 * Searchable department picker backed by organization_departments.
 * Persists the department **name** on profiles.department (existing column).
 */
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
  const { data: fetched = [], isLoading } = useOrganizationDepartments(
    shouldFetch ? companyId : null,
    false,
  );

  const departments = useMemo<DepartmentOption[]>(() => {
    if (provided) return provided;
    return fetched
      .filter((d) => d.isActive !== false)
      .map((d) => ({ id: d.id, name: d.name }));
  }, [fetched, provided]);

  const options = useMemo(() => {
    const sorted = [...departments].sort((a, b) => a.name.localeCompare(b.name));
    return [
      {
        value: NONE_VALUE,
        label: t("users.form.departmentNone"),
      },
      ...sorted.map((d) => ({
        value: d.name,
        label: d.name,
      })),
    ];
  }, [departments, t]);

  const selectedValue = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return NONE_VALUE;
    const match = departments.find(
      (d) => d.name.localeCompare(trimmed, undefined, { sensitivity: "accent" }) === 0,
    );
    return match?.name ?? NONE_VALUE;
  }, [departments, value]);

  const loading = isLoading && shouldFetch;

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
