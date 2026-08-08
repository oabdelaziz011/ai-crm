import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CapabilityMultiSelect } from "@/components/scheduling/capabilities/capability-multi-select";
import { Button } from "@/components/ui/button";
import type { BranchRecord } from "@/lib/company/branches/types";

type Props = {
  label: string;
  branches: Pick<BranchRecord, "id" | "name" | "code">[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  disabled?: boolean;
  isLoading?: boolean;
  emptyMessage?: string;
  /** Opens inline BranchFormDialog (employee form stays open). */
  onCreateBranch?: () => void;
};

export function BranchAssignmentMultiSelect({
  label,
  branches,
  selectedIds,
  onChange,
  disabled,
  isLoading,
  emptyMessage,
  onCreateBranch,
}: Props) {
  const { t } = useTranslation("common");
  const resolvedEmpty = emptyMessage ?? t("branches.users.noBranchesAvailable");

  const items = branches.map((branch) => ({
    id: branch.id,
    label: branch.name,
    meta: branch.code ?? undefined,
  }));

  if (!isLoading && branches.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{label}</p>
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-center">
          <p className="text-sm text-muted-foreground">{resolvedEmpty}</p>
          {onCreateBranch ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 h-8 gap-1.5"
              disabled={disabled}
              onClick={onCreateBranch}
            >
              <Plus className="size-3.5" />
              {t("branches.users.createBranch")}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <CapabilityMultiSelect
        label={label}
        items={items}
        selectedIds={selectedIds}
        onChange={onChange}
        disabled={disabled}
        isLoading={isLoading}
        emptyMessage={resolvedEmpty}
        searchPlaceholder={t("branches.users.searchPlaceholder")}
      />
      {onCreateBranch ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 px-2 text-primary"
          disabled={disabled || isLoading}
          onClick={onCreateBranch}
        >
          <Plus className="size-3.5" />
          {t("branches.users.createBranch")}
        </Button>
      ) : null}
    </div>
  );
}
