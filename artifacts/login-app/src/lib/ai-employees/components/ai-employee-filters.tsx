import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AiEmployeeListFilter, AiEmployeeRecord } from "@/lib/ai-employees/types";
import {
  selectUniqueDepartments,
  selectUniqueProviders,
  selectUniqueTags,
} from "@/lib/ai-employees/selectors";
import {
  formatEmployeeDepartmentLabel,
  formatEmployeeProviderLabel,
} from "@/lib/ai-employees/utilities/format-employee-field-label";
import { formatEmployeeTagLabel } from "@/lib/ai-employees/utilities/format-employee-tag-label";

type AiEmployeeFiltersProps = {
  filter: AiEmployeeListFilter;
  employees: AiEmployeeRecord[];
  ownerOptions: Array<{ id: string; label: string }>;
  onChange: (patch: Partial<AiEmployeeListFilter>) => void;
};

export const AiEmployeeFilters = memo(function AiEmployeeFilters({
  filter,
  employees,
  ownerOptions,
  onChange,
}: AiEmployeeFiltersProps) {
  const { t } = useTranslation("common");

  const departments = useMemo(() => selectUniqueDepartments(employees), [employees]);
  const providers = useMemo(() => selectUniqueProviders(employees), [employees]);
  const tags = useMemo(() => selectUniqueTags(employees), [employees]);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <div className="space-y-1.5 xl:col-span-2">
        <Label htmlFor="ai-employee-search">{t("aiEmployees.filters.search")}</Label>
        <Input
          id="ai-employee-search"
          value={filter.search ?? ""}
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder={t("aiEmployees.filters.searchPlaceholder")}
          className="rounded-xl"
        />
      </div>

      <FilterSelect
        label={t("aiEmployees.filters.status")}
        value={filter.status ?? "all"}
        onValueChange={(value) => onChange({ status: value as AiEmployeeListFilter["status"] })}
        options={[
          { value: "all", label: t("aiEmployees.filters.all") },
          { value: "draft", label: t("aiEmployees.status.draft") },
          { value: "published", label: t("aiEmployees.status.published") },
          { value: "disabled", label: t("aiEmployees.status.disabled") },
          { value: "archived", label: t("aiEmployees.status.archived") },
        ]}
      />

      <FilterSelect
        label={t("aiEmployees.filters.department")}
        value={filter.department ?? "all"}
        onValueChange={(value) => onChange({ department: value })}
        options={[
          { value: "all", label: t("aiEmployees.filters.all") },
          ...departments.map((department) => ({
            value: department,
            label: formatEmployeeDepartmentLabel(t, department),
          })),
        ]}
      />

      <FilterSelect
        label={t("aiEmployees.filters.provider")}
        value={filter.provider ?? "all"}
        onValueChange={(value) => onChange({ provider: value })}
        options={[
          { value: "all", label: t("aiEmployees.filters.all") },
          ...providers.map((provider) => ({
            value: provider,
            label: formatEmployeeProviderLabel(t, provider),
          })),
        ]}
      />

      <FilterSelect
        label={t("aiEmployees.filters.owner")}
        value={filter.ownerId ?? "all"}
        onValueChange={(value) => onChange({ ownerId: value })}
        options={[
          { value: "all", label: t("aiEmployees.filters.all") },
          ...ownerOptions.map((owner) => ({ value: owner.id, label: owner.label })),
        ]}
      />

      <FilterSelect
        label={t("aiEmployees.filters.tags")}
        value={filter.tags?.[0] ?? "all"}
        onValueChange={(value) => onChange({ tags: value === "all" ? [] : [value] })}
        options={[
          { value: "all", label: t("aiEmployees.filters.all") },
          ...tags.map((tag) => ({ value: tag, label: formatEmployeeTagLabel(t, tag) })),
        ]}
      />
    </div>
  );
});

const FilterSelect = memo(function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="rounded-xl">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
});
